"""Service-role access to Supabase REST for the admin panel.

Why REST and not the SQL connection: the admin tables created by
``database/supabase/admin.sql`` are intentionally unreadable by ordinary
sessions (RLS on, no anon/authenticated grant). The only principal that can
read them is the service role, and Supabase exposes that principal over
PostgREST. Going through it means:

* one credential, held only on the server, with no second database password;
* every query is a normal PostgREST call, so the SQL injection surface is the
  parameter binding PostgREST does, not string-concatenated SQL;
* the same code path works against a hosted Supabase project and a local one.

The service role key is read from settings and is never logged, returned, or
put in a response body (``_redact`` refuses to serialise it anywhere).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx

from app.core.config import Settings, settings as default_settings

if TYPE_CHECKING:  # pragma: no cover - typing only
    from app.core.security import AdminActor

# PostgREST caps a single response at the project's max-rows setting. Asking for
# exactly that keeps pagination predictable.
MAX_PAGE = 1000

# Object storage bucket for KYC documents (created in database/supabase/
# storage.sql). Admin access is proxied with short-lived signed URLs.
KYC_BUCKET = "kyc-documents"


class AdminStoreError(RuntimeError):
    """A PostgREST call failed. The message is safe to show to an admin."""


class AdminStore:
    """Thin, typed wrapper over PostgREST for the tables the panel manages."""

    def __init__(self, base_url: str, service_key: str, timeout: float = 20.0) -> None:
        self._base = f"{base_url.rstrip('/')}/rest/v1"
        self._key = service_key
        self._timeout = timeout

    @classmethod
    def from_settings(cls, cfg: Settings | None = None) -> "AdminStore":
        cfg = cfg or default_settings
        return cls(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY)

    # ── low level ─────────────────────────────────────────────────────────
    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def _request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        headers_extra: dict[str, str] | None = None,
    ) -> httpx.Response:
        url = f"{self._base}/{table}"
        headers = self._headers(prefer)
        if headers_extra:
            headers.update(headers_extra)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.request(
                    method, url, params=_clean_params(params), json=json, headers=headers
                )
        except httpx.HTTPError as exc:  # network / DNS / timeout
            raise AdminStoreError("The database service is unreachable.") from exc

        if res.status_code >= 400:
            raise AdminStoreError(_postgrest_message(res))
        return res

    async def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, str] | None = None,
        or_filter: str | None = None,
        order: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
        count: bool = False,
        single: bool = False,
    ) -> Any:
        """Select rows. Returns a list, or one dict when ``single`` is set."""
        params: dict[str, Any] = {"select": columns}
        if filters:
            params.update(filters)
        if or_filter:
            params["or"] = or_filter
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = max(0, min(limit, MAX_PAGE))
        if offset:
            params["offset"] = offset
        prefer = None
        if count:
            prefer = "count=exact"
        if single:
            prefer = (prefer + "," if prefer else "") + "application/vnd.pgrst.object+json"
        res = await self._request("GET", table, params=params, prefer=prefer)
        if count:
            total = res.headers.get("content-range", "").split("/")[-1]
            return res.json(), int(total) if total.isdigit() else None
        return res.json()

    async def insert(
        self, table: str, rows: dict[str, Any] | list[dict[str, Any]], *, returning: bool = True
    ) -> Any:
        res = await self._request(
            "POST",
            table,
            json=rows,
            prefer="return=representation" if returning else "return=minimal",
        )
        return res.json() if returning else None

    async def update(
        self, table: str, values: dict[str, Any], *, filters: dict[str, str]
    ) -> list[dict[str, Any]]:
        res = await self._request(
            "PATCH", table, params=filters, json=values, prefer="return=representation"
        )
        return res.json()

    async def delete(self, table: str, *, filters: dict[str, str]) -> None:
        """Delete rows matching `filters`.

        Deliberately narrow: every caller passes an equality filter on a key
        column, which is what keeps a mapping reset from ever emptying a table.
        """
        await self._request("DELETE", table, params=filters)

    async def rpc(self, fn: str, args: dict[str, Any] | None = None) -> Any:
        res = await self._request("POST", f"rpc/{fn}", json=args or {})
        return res.json()

    # ── domain helpers ────────────────────────────────────────────────────
    async def audit(
        self,
        *,
        admin: "AdminActor",
        action: str,
        module: str,
        target_type: str | None = None,
        target_id: str | None = None,
        reason: str | None = None,
        before: Any = None,
        after: Any = None,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Append one audit row.

        Auditing is best-effort in the sense that a write failure must not roll
        back the action the admin just took, but it is never silent: the error
        propagates to the caller so the route can log it server-side.
        """
        await self.insert(
            "admin_audit_logs",
            {
                "admin_id": admin.user_id,
                "admin_email": admin.email,
                "admin_role": admin.role_key,
                "action": action,
                "module": module,
                "target_type": target_type,
                "target_id": target_id,
                "reason": reason,
                "before_state": _safe_json(before),
                "after_state": _safe_json(after),
                "ip_address": ip,
                "user_agent": (user_agent or "")[:300] or None,
            },
            returning=False,
        )

    async def signed_document_url(self, path: str, expires_seconds: int = 300) -> str | None:
        """Short-lived signed URL for an object in the private KYC bucket.

        The document is never proxied through this API: the admin gets a URL
        that dies in minutes, and every issue is audited by the caller.
        """
        storage_base = self._base.rsplit("/rest/v1", 1)[0]
        safe_path = path.lstrip("/")
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.post(
                    f"{storage_base}/storage/v1/object/sign/{KYC_BUCKET}/{safe_path}",
                    json={"expiresIn": max(60, min(expires_seconds, 900))},
                    headers={
                        "apikey": self._key,
                        "Authorization": f"Bearer {self._key}",
                    },
                )
        except httpx.HTTPError as exc:
            raise AdminStoreError("The document store is unreachable.") from exc

        if res.status_code >= 400:
            raise AdminStoreError("The identity document could not be opened.")
        signed = (res.json() or {}).get("signedURL") or (res.json() or {}).get("signedUrl")
        if not signed:
            return None
        if signed.startswith("http"):
            return signed
        return f"{storage_base}/storage/v1{signed}"

    async def all_pages(
        self, table: str, *, columns: str = "*", filters: dict[str, str] | None = None
    ) -> list[dict[str, Any]]:
        """Fetch every row a small reference table holds (roles, permissions)."""
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = await self.select(table, columns=columns, filters=filters, limit=MAX_PAGE, offset=offset)
            rows.extend(page)
            if len(page) < MAX_PAGE:
                return rows
            offset += MAX_PAGE


def _clean_params(params: dict[str, Any] | None) -> dict[str, Any]:
    if not params:
        return {}
    return {k: v for k, v in params.items() if v is not None}


def _postgrest_message(res: httpx.Response) -> str:
    """Turn a PostgREST error into something an admin can act on."""
    try:
        body = res.json()
    except ValueError:
        return f"Database request failed ({res.status_code})."
    message = body.get("message") if isinstance(body, dict) else None
    code = body.get("code") if isinstance(body, dict) else None
    if res.status_code == 404 or code == "PGRST205":
        return "The admin tables are not set up yet. Run database/supabase/admin.sql."
    if code == "23505":
        return "That record already exists."
    if code == "23503":
        return "A referenced record does not exist."
    if code == "23514":
        return "The value broke a data rule (check constraint)."
    return message or f"Database request failed ({res.status_code})."


def _safe_json(value: Any) -> Any:
    """Strip anything that must never reach the audit table."""
    if value is None or isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, str):
        return value[:2000]
    if isinstance(value, dict):
        blocked = {"service_key", "password", "token", "secret", "api_key", "document_url"}
        return {
            k: _safe_json(v)
            for k, v in value.items()
            if k.lower() not in blocked and not k.lower().endswith("_key")
        }
    if isinstance(value, (list, tuple)):
        return [_safe_json(v) for v in value][:200]
    return str(value)[:2000]


# Imported at the bottom to avoid a circular import at module load time.
# NOTE: `AdminActor` is imported from `app.core.security`. That module does
# not import this one, so there is no cycle — the annotation is written as a
# string above only to keep the type visible before the import line.

__all__ = ["AdminStore", "AdminStoreError", "MAX_PAGE", "KYC_BUCKET"]
