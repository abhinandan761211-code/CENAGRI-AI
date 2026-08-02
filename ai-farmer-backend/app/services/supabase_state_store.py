import os
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional

from supabase import Client, create_client


class DashboardStateStore:
    """Stores dashboard JSON payloads in Supabase table with local fallback."""

    def __init__(self) -> None:
        self._supabase_url = os.getenv("SUPABASE_URL", "").strip()
        self._supabase_key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            or os.getenv("SUPABASE_ANON_KEY", "").strip()
            or os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        )
        self._key_type = "service_role" if os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip() else (
            "anon" if os.getenv("SUPABASE_ANON_KEY", "").strip() else (
                "publishable" if os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip() else "missing"
            )
        )
        self._table = os.getenv("SUPABASE_DASHBOARD_TABLE", "dashboard_state").strip() or "dashboard_state"
        self._client: Optional[Client] = None
        self._fallback_cache: Dict[str, Dict[str, Any]] = {}

    @property
    def enabled(self) -> bool:
        return bool(self._supabase_url and self._supabase_key)

    def _get_client(self) -> Optional[Client]:
        if not self.enabled:
            return None
        if self._client is None:
            self._client = create_client(self._supabase_url, self._supabase_key)
        return self._client

    def get_state(self, scope: str, default_payload: Dict[str, Any]) -> Dict[str, Any]:
        client = self._get_client()

        if client is None:
            payload = self._fallback_cache.get(scope, default_payload)
            self._fallback_cache[scope] = payload
            return payload

        try:
            response = (
                client.table(self._table)
                .select("payload")
                .eq("scope", scope)
                .limit(1)
                .execute()
            )

            rows = response.data or []
            if rows:
                payload = rows[0].get("payload") or default_payload
                self._fallback_cache[scope] = payload
                return payload

            self.save_state(scope, default_payload)
            return default_payload
        except Exception:
            payload = self._fallback_cache.get(scope, default_payload)
            self._fallback_cache[scope] = payload
            return payload

    def save_state(self, scope: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        self._fallback_cache[scope] = payload
        client = self._get_client()
        if client is None:
            return payload

        try:
            (
                client.table(self._table)
                .upsert({"scope": scope, "payload": payload}, on_conflict="scope")
                .execute()
            )
        except Exception:
            pass

        return payload

    def list_scopes(self) -> List[str]:
        client = self._get_client()
        if client is None:
            return sorted(self._fallback_cache.keys())

        try:
            response = (
                client.table(self._table)
                .select("scope")
                .order("scope", desc=False)
                .limit(1000)
                .execute()
            )
            rows = response.data or []
            scopes = [str(row.get("scope") or "").strip() for row in rows if row.get("scope")]
            return sorted(set(scopes))
        except Exception:
            return sorted(self._fallback_cache.keys())

    def fetch_scope(self, scope: str) -> Optional[Dict[str, Any]]:
        clean_scope = str(scope or "").strip()
        if not clean_scope:
            return None

        client = self._get_client()
        if client is None:
            return self._fallback_cache.get(clean_scope)

        try:
            response = (
                client.table(self._table)
                .select("payload")
                .eq("scope", clean_scope)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            if not rows:
                return self._fallback_cache.get(clean_scope)
            payload = rows[0].get("payload")
            if isinstance(payload, dict):
                self._fallback_cache[clean_scope] = payload
                return payload
            return None
        except Exception:
            return self._fallback_cache.get(clean_scope)

    def delete_scope(self, scope: str) -> bool:
        clean_scope = str(scope or "").strip()
        if not clean_scope:
            return False

        self._fallback_cache.pop(clean_scope, None)
        client = self._get_client()
        if client is None:
            return True

        try:
            client.table(self._table).delete().eq("scope", clean_scope).execute()
            return True
        except Exception:
            return False

    def health(self) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "mode": "fallback",
                "enabled": False,
                "table": self._table,
                "reason": "SUPABASE_URL or Supabase key missing",
            }

        client = self._get_client()
        if client is None:
            return {
                "mode": "fallback",
                "enabled": False,
                "table": self._table,
                "reason": "Supabase client not initialized",
            }

        try:
            client.table(self._table).select("scope").limit(1).execute()
            return {
                "mode": "supabase",
                "enabled": True,
                "table": self._table,
                "key_type": self._key_type,
                "reason": "Supabase connection healthy",
            }
        except Exception as exc:
            return {
                "mode": "fallback",
                "enabled": False,
                "table": self._table,
                "reason": f"Supabase query failed: {str(exc)}",
            }

    def roundtrip_test(self) -> Dict[str, Any]:
        """Writes and reads a health-check payload to verify persistence."""
        health = self.health()
        if not health.get("enabled"):
            return {
                "ok": False,
                "mode": health.get("mode", "fallback"),
                "reason": health.get("reason", "Supabase not enabled"),
            }

        scope = "dashboard_state_healthcheck"
        probe_payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "probe": "supabase_roundtrip",
        }

        self.save_state(scope, probe_payload)
        read_payload = self.get_state(scope, {})
        ok = (
            isinstance(read_payload, dict)
            and read_payload.get("probe") == "supabase_roundtrip"
            and bool(read_payload.get("timestamp"))
        )

        return {
            "ok": ok,
            "mode": "supabase" if ok else "fallback",
            "scope": scope,
            "written": probe_payload,
            "read": read_payload,
        }


@lru_cache(maxsize=1)
def get_dashboard_state_store() -> DashboardStateStore:
    return DashboardStateStore()
