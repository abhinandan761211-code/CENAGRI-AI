"""
Central Supabase database service.

This module provides a single SupabaseDB instance used by API routes.
It is intentionally Supabase-first for production usage.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from supabase import Client, create_client


class SupabaseDB:
    """Singleton wrapper around the Supabase client for DB operations."""

    def __init__(self) -> None:
        self._url = os.getenv("SUPABASE_URL", "").strip()
        self._key = (
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
            or os.getenv("SUPABASE_ANON_KEY", "").strip()
            or os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        )
        self._dashboard_table = os.getenv("SUPABASE_DASHBOARD_TABLE", "dashboard_state").strip() or "dashboard_state"
        self._local_users_fallback_path = Path(__file__).resolve().parents[2] / "data" / "local_users_fallback.json"
        self._client: Optional[Client] = None

    @property
    def ready(self) -> bool:
        return bool(self._url and self._key)

    def client(self) -> Client:
        if not self.ready:
            raise RuntimeError("Supabase not configured: set SUPABASE_URL and a Supabase key")
        if self._client is None:
            self._client = create_client(self._url, self._key)
        return self._client

    @staticmethod
    def _is_missing_column_error(exc: Exception) -> bool:
        text = str(exc or "")
        return "PGRST204" in text or "schema cache" in text

    @staticmethod
    def _normalize_user_row(row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not row:
            return None
        normalized = dict(row)
        normalized.setdefault("name", normalized.get("full_name") or "")
        normalized.setdefault("phone", normalized.get("phone") or "")
        normalized.setdefault("user_type", normalized.get("user_type") or "farmer")
        normalized.setdefault("password", normalized.get("password") or normalized.get("hashed_password") or "")
        normalized.setdefault("business_name", normalized.get("business_name"))
        normalized.setdefault("location", normalized.get("location"))
        normalized.setdefault("gst_number", normalized.get("gst_number"))
        normalized.setdefault("vehicle_type", normalized.get("vehicle_type"))
        normalized.setdefault("license_number", normalized.get("license_number"))
        normalized.setdefault("store_type", normalized.get("store_type"))
        normalized.setdefault("farm_size", normalized.get("farm_size"))
        normalized.setdefault("is_active", bool(normalized.get("is_active", True)))
        normalized.setdefault("created_at", normalized.get("created_at") or datetime.now(timezone.utc).isoformat())
        return normalized

    @staticmethod
    def _is_soft_deleted_user(row: Optional[Dict[str, Any]]) -> bool:
        if not row:
            return False
        email = str(row.get("email") or "").strip().lower()
        name = str(row.get("name") or "").strip()
        return (email.startswith("deleted+") and email.endswith("@deleted.local")) or name == "[Deleted User]"

    def _load_local_users_fallback(self) -> List[Dict[str, Any]]:
        try:
            if not self._local_users_fallback_path.exists():
                return []
            with self._local_users_fallback_path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if not isinstance(payload, list):
                return []
            rows: List[Dict[str, Any]] = []
            for row in payload:
                if isinstance(row, dict):
                    rows.append(self._normalize_user_row(row) or row)
            return [row for row in rows if row]
        except Exception:
            return []

    def _save_local_users_fallback(self, rows: List[Dict[str, Any]]) -> None:
        self._local_users_fallback_path.parent.mkdir(parents=True, exist_ok=True)
        with self._local_users_fallback_path.open("w", encoding="utf-8") as handle:
            json.dump(rows, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

    def _next_local_user_id(self, rows: List[Dict[str, Any]]) -> int:
        numeric_ids: List[int] = []
        for row in rows:
            try:
                numeric_ids.append(int(row.get("id")))
            except Exception:
                continue
        return (max(numeric_ids) if numeric_ids else 0) + 1

    def _append_local_user(self, data: Dict[str, Any]) -> Dict[str, Any]:
        rows = self._load_local_users_fallback()
        now_iso = data.get("updated_at") or data.get("created_at") or datetime.now(timezone.utc).isoformat()
        record = {
            "id": self._next_local_user_id(rows),
            "name": str(data.get("name") or data.get("full_name") or ""),
            "email": str(data.get("email") or "").strip().lower(),
            "phone": str(data.get("phone") or ""),
            "password": str(data.get("password") or data.get("hashed_password") or ""),
            "user_type": str(data.get("user_type") or "farmer"),
            "business_name": data.get("business_name"),
            "location": data.get("location"),
            "gst_number": data.get("gst_number"),
            "vehicle_type": data.get("vehicle_type"),
            "license_number": data.get("license_number"),
            "store_type": data.get("store_type"),
            "farm_size": data.get("farm_size"),
            "is_active": bool(data.get("is_active", True)),
            "created_at": data.get("created_at") or now_iso,
            "updated_at": now_iso,
        }
        rows.append(record)
        self._save_local_users_fallback(rows)
        return self._normalize_user_row(record) or record

    def health(self) -> Dict[str, Any]:
        info: Dict[str, Any] = {
            "configured": self.ready,
            "url": self._url,
            "dashboard_table": self._dashboard_table,
        }
        if not self.ready:
            info["status"] = "not_configured"
            return info
        try:
            self.client().table("users").select("id", count="exact").limit(1).execute()
            info["status"] = "ok"
        except Exception as exc:
            info["status"] = "error"
            info["error"] = str(exc)
        return info

    # ------------------------------------------------------------------ #
    #  USERS
    # ------------------------------------------------------------------ #

    def create_user(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            resp = self.client().table("users").insert(data).execute()
            rows = resp.data or []
            if rows:
                return self._normalize_user_row(rows[0]) or rows[0]
        except Exception as exc:
            if not self._is_missing_column_error(exc):
                return self._append_local_user(data)

        # Fallback insert for minimal users schema
        minimal = {
            "email": str(data.get("email") or "").strip().lower(),
            "hashed_password": data.get("password") or data.get("hashed_password") or "",
            "full_name": data.get("name") or data.get("full_name") or "",
            "created_at": data.get("created_at") or datetime.now(timezone.utc).isoformat(),
        }
        try:
            resp = self.client().table("users").insert(minimal).execute()
            rows = resp.data or []
            if rows:
                normalized = self._normalize_user_row(rows[0]) or rows[0]
                normalized["user_type"] = data.get("user_type") or normalized.get("user_type") or "farmer"
                normalized["phone"] = data.get("phone") or normalized.get("phone") or ""
                return normalized
        except Exception:
            pass

        return self._append_local_user(data)

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        normalized_email = str(email or "").strip().lower()
        if not normalized_email:
            return None
        try:
            resp = self.client().table("users").select("*").eq("email", normalized_email).limit(1).execute()
            rows = resp.data or []
            if rows:
                return self._normalize_user_row(rows[0])
            fallback = self.client().table("users").select("*").ilike("email", normalized_email).limit(1).execute()
            fallback_rows = fallback.data or []
            if fallback_rows:
                return self._normalize_user_row(fallback_rows[0])
        except Exception:
            pass

        local_rows = [row for row in self._load_local_users_fallback() if str(row.get("email") or "").strip().lower() == normalized_email]
        local_rows.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
        return local_rows[0] if local_rows else None

    def get_users_by_email(self, email: str) -> List[Dict[str, Any]]:
        normalized_email = str(email or "").strip().lower()
        if not normalized_email:
            return []

        rows: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()

        def append_rows(source_rows: List[Dict[str, Any]]) -> None:
            for row in source_rows or []:
                normalized = self._normalize_user_row(row) or row
                row_id = str(normalized.get("id") or "")
                if row_id and row_id in seen_ids:
                    continue
                if row_id:
                    seen_ids.add(row_id)
                rows.append(normalized)

        try:
            resp = (
                self.client()
                .table("users")
                .select("*")
                .eq("email", normalized_email)
                .order("created_at", desc=True)
                .execute()
            )
            append_rows(resp.data or [])
        except Exception:
            # Keep login resilient even if ordering is unavailable in older schemas.
            pass

        try:
            fallback = (
                self.client()
                .table("users")
                .select("*")
                .ilike("email", normalized_email)
                .order("created_at", desc=True)
                .execute()
            )
            append_rows(fallback.data or [])
        except Exception:
            pass

        local_rows = [row for row in self._load_local_users_fallback() if str(row.get("email") or "").strip().lower() == normalized_email]
        local_rows.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
        append_rows(local_rows)

        return rows

    def get_user_by_id(self, user_id: Any) -> Optional[Dict[str, Any]]:
        try:
            resp = self.client().table("users").select("*").eq("id", user_id).limit(1).execute()
            rows = resp.data or []
            if rows:
                return self._normalize_user_row(rows[0])
        except Exception:
            pass

        target_id = str(user_id or "").strip()
        for row in self._load_local_users_fallback():
            if str(row.get("id") or "").strip() == target_id:
                return row
        return None

    def get_all_users(self) -> List[Dict[str, Any]]:
        try:
            resp = self.client().table("users").select("*").order("id").execute()
            rows = [self._normalize_user_row(r) or r for r in (resp.data or [])]
            filtered = [row for row in rows if not self._is_soft_deleted_user(row)]
            if filtered:
                return filtered
        except Exception:
            pass
        return [row for row in self._load_local_users_fallback() if not self._is_soft_deleted_user(row)]

    def get_users_by_role(self, role: str) -> List[Dict[str, Any]]:
        try:
            resp = self.client().table("users").select("*").eq("user_type", role).order("id").execute()
            return [self._normalize_user_row(r) or r for r in (resp.data or [])]
        except Exception as exc:
            if not self._is_missing_column_error(exc):
                raise
            return [u for u in self.get_all_users() if str(u.get("user_type", "farmer")).strip().lower() == str(role).strip().lower()]

    def get_users_grouped_by_role(self) -> Dict[str, List[Dict[str, Any]]]:
        roles = [
            "farmer",
            "buyer",
            "local_buyer",
            "worker",
            "equipment_owner",
            "transporter",
            "store",
            "admin",
            "seller",
        ]
        grouped: Dict[str, List[Dict[str, Any]]] = {role: [] for role in roles}
        for row in self.get_all_users():
            role = str(row.get("user_type", "farmer")).strip().lower()
            if role not in grouped:
                grouped[role] = []
            grouped[role].append(row)
        return grouped

    def update_user(self, user_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            resp = self.client().table("users").update(data).eq("id", user_id).execute()
            rows = resp.data or []
            return self._normalize_user_row(rows[0]) if rows else None
        except Exception as exc:
            if not self._is_missing_column_error(exc):
                raise
            patch: Dict[str, Any] = {}
            if "name" in data:
                patch["full_name"] = data["name"]
            if "password" in data:
                patch["hashed_password"] = data["password"]
            if not patch:
                return self.get_user_by_id(user_id)
            resp = self.client().table("users").update(patch).eq("id", user_id).execute()
            rows = resp.data or []
            return self._normalize_user_row(rows[0]) if rows else None

    def update_user_password(self, user_id: Any, new_hashed_password: str) -> None:
        try:
            self.client().table("users").update({"password": new_hashed_password}).eq("id", user_id).execute()
            return
        except Exception as exc:
            if not self._is_missing_column_error(exc):
                target_id = str(user_id or "").strip()
                rows = self._load_local_users_fallback()
                for row in rows:
                    if str(row.get("id") or "").strip() == target_id:
                        row["password"] = new_hashed_password
                        row["updated_at"] = datetime.now(timezone.utc).isoformat()
                        self._save_local_users_fallback(rows)
                        return
                raise
        try:
            self.client().table("users").update({"hashed_password": new_hashed_password}).eq("id", user_id).execute()
        except Exception:
            target_id = str(user_id or "").strip()
            rows = self._load_local_users_fallback()
            for row in rows:
                if str(row.get("id") or "").strip() == target_id:
                    row["password"] = new_hashed_password
                    row["updated_at"] = datetime.now(timezone.utc).isoformat()
                    self._save_local_users_fallback(rows)
                    return
            raise

    def delete_user(self, user_id: Any) -> bool:
        try:
            existing = self.get_user_by_id(user_id)
            if not existing:
                return False

            self.client().table("users").delete().eq("id", user_id).execute()
            if self.get_user_by_id(user_id) is None:
                return True

            # Some Supabase policies block hard delete; fallback to soft delete.
            tombstone_email = f"deleted+{str(user_id)}@deleted.local"
            patch = {
                "name": "[Deleted User]",
                "email": tombstone_email,
                "phone": "",
                "is_active": False,
            }
            updated = self.update_user(user_id, patch)
            return updated is not None
        except Exception:
            return False

    # ------------------------------------------------------------------ #
    #  PRODUCTS + ORDERS
    # ------------------------------------------------------------------ #

    def get_products(self) -> List[Dict[str, Any]]:
        try:
            resp = self.client().table("products").select("*").order("id", desc=True).execute()
            return resp.data or []
        except Exception:
            # Buyer dashboard should still render with seeded defaults if DB table is missing.
            return []

    def get_products_by_seller(self, seller_id: Any) -> List[Dict[str, Any]]:
        normalized_seller_id = str(seller_id or "").strip()
        if not normalized_seller_id:
            return []
        try:
            resp = self.client().table("products").select("*").eq("seller_id", normalized_seller_id).order("id", desc=True).execute()
            return resp.data or []
        except Exception:
            return []

    def create_product(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            resp = self.client().table("products").insert(data).execute()
            rows = resp.data or []
            if not rows:
                raise RuntimeError("Product insert returned no rows")
            return rows[0]
        except Exception as exc:
            raise RuntimeError(f"Failed to create product: {exc}")

    def update_product(self, product_id: int, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            resp = self.client().table("products").update(patch).eq("id", product_id).execute()
            rows = resp.data or []
            return rows[0] if rows else None
        except Exception:
            return None

    def delete_product(self, product_id: int) -> bool:
        try:
            self.client().table("products").delete().eq("id", product_id).execute()
            return True
        except Exception:
            return False

    def create_order(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        try:
            resp = self.client().table("orders").insert(data).execute()
            rows = resp.data or []
            return rows[0] if rows else None
        except Exception:
            # Order logging must not block buyer flow.
            return None

    # ------------------------------------------------------------------ #
    #  DASHBOARD STATE HELPERS
    # ------------------------------------------------------------------ #

    def _get_state_row(self, scope: str) -> Optional[Dict[str, Any]]:
        try:
            resp = self.client().table(self._dashboard_table).select("*").eq("scope", scope).limit(1).execute()
            rows = resp.data or []
            return rows[0] if rows else None
        except Exception:
            # If dashboard_state doesn't exist yet, audit/settings should not block auth flow.
            return None

    def _get_state_payload(self, scope: str, default_payload: Any) -> Any:
        row = self._get_state_row(scope)
        if not row:
            return default_payload
        payload = row.get("payload")
        return payload if payload is not None else default_payload

    def _upsert_state_payload(self, scope: str, payload: Any) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            row = self._get_state_row(scope)
            if row and row.get("id") is not None:
                self.client().table(self._dashboard_table).update(
                    {"payload": payload, "updated_at": now_iso}
                ).eq("id", row["id"]).execute()
                return

            data = {
                "scope": scope,
                "payload": payload,
                "updated_at": now_iso,
            }
            self.client().table(self._dashboard_table).insert(data).execute()
        except Exception:
            # Missing dashboard_state table should be non-fatal in auth runtime.
            return

    # ------------------------------------------------------------------ #
    #  ADMIN SETTINGS + AUTH AUDIT
    # ------------------------------------------------------------------ #

    @staticmethod
    def _default_admin_settings() -> Dict[str, Any]:
        return {
            "kyc_verified": False,
            "approved": False,
            "access_locked": False,
            "operating_system": "",
            "notes": "",
            "last_activity_at": None,
            "updated_at": None,
        }

    @staticmethod
    def _default_auth_audit_record() -> Dict[str, Any]:
        return {
            "user_id": None,
            "email": "",
            "role": "farmer",
            "created_by": None,
            "registered_at": None,
            "last_login_at": None,
            "login_count": 0,
            "failed_attempts": 0,
            "last_failed_attempt_at": None,
            "updated_at": None,
        }

    def _get_admin_settings_payload(self) -> Dict[str, Dict[str, Any]]:
        payload = self._get_state_payload("admin_user_settings", {})
        return payload if isinstance(payload, dict) else {}

    def _save_admin_settings_payload(self, payload: Dict[str, Dict[str, Any]]) -> None:
        self._upsert_state_payload("admin_user_settings", payload)

    def _get_auth_audit_payload(self) -> Dict[str, Dict[str, Any]]:
        payload = self._get_state_payload("auth_audit", {})
        return payload if isinstance(payload, dict) else {}

    def _save_auth_audit_payload(self, payload: Dict[str, Dict[str, Any]]) -> None:
        self._upsert_state_payload("auth_audit", payload)

    def get_user_admin_settings(self, user_id: Any) -> Dict[str, Any]:
        payload = self._get_admin_settings_payload()
        key = str(user_id)
        base = self._default_admin_settings()
        base.update(payload.get(key) or {})
        return base

    def get_admin_settings_for_users(self, user_ids: List[Any]) -> Dict[str, Dict[str, Any]]:
        payload = self._get_admin_settings_payload()
        result: Dict[str, Dict[str, Any]] = {}
        for uid in user_ids:
            key = str(uid)
            data = self._default_admin_settings()
            data.update(payload.get(key) or {})
            result[key] = data
        return result

    def update_user_admin_settings(self, user_id: Any, patch: Dict[str, Any]) -> Dict[str, Any]:
        payload = self._get_admin_settings_payload()
        key = str(user_id)
        base = self._default_admin_settings()
        base.update(payload.get(key) or {})
        base.update(patch or {})
        base["updated_at"] = datetime.now(timezone.utc).isoformat()
        payload[key] = base
        self._save_admin_settings_payload(payload)
        return base

    def get_auth_audit_rows(self) -> List[Dict[str, Any]]:
        payload = self._get_auth_audit_payload()
        rows: List[Dict[str, Any]] = []
        for key, value in payload.items():
            row = self._default_auth_audit_record()
            if isinstance(value, dict):
                row.update(value)
            if not row.get("email"):
                row["email"] = key
            rows.append(row)
        return rows

    def record_user_registered(self, user_row: Dict[str, Any], created_by: Optional[str] = None) -> None:
        payload = self._get_auth_audit_payload()
        email = str(user_row.get("email") or "").strip().lower()
        if not email:
            return
        row = self._default_auth_audit_record()
        row.update(payload.get(email) or {})
        now_iso = datetime.now(timezone.utc).isoformat()
        row.update(
            {
                "user_id": user_row.get("id"),
                "email": email,
                "role": user_row.get("user_type", "farmer"),
                "created_by": created_by,
                "registered_at": row.get("registered_at") or now_iso,
                "updated_at": now_iso,
            }
        )
        payload[email] = row
        self._save_auth_audit_payload(payload)

    def record_login_success(self, email: str) -> Dict[str, Any]:
        payload = self._get_auth_audit_payload()
        key = str(email or "").strip().lower()
        row = self._default_auth_audit_record()
        row.update(payload.get(key) or {})
        now_iso = datetime.now(timezone.utc).isoformat()
        row["email"] = key
        row["failed_attempts"] = 0
        row["last_login_at"] = now_iso
        row["login_count"] = int(row.get("login_count", 0) or 0) + 1
        row["updated_at"] = now_iso
        payload[key] = row
        self._save_auth_audit_payload(payload)
        return row

    def record_login_failure(self, email: str) -> Dict[str, Any]:
        payload = self._get_auth_audit_payload()
        key = str(email or "").strip().lower()
        row = self._default_auth_audit_record()
        row.update(payload.get(key) or {})
        now_iso = datetime.now(timezone.utc).isoformat()
        row["email"] = key
        row["failed_attempts"] = int(row.get("failed_attempts", 0) or 0) + 1
        row["last_failed_attempt_at"] = now_iso
        row["updated_at"] = now_iso
        payload[key] = row
        self._save_auth_audit_payload(payload)
        return row

    def reset_failed_attempts(self, email: str) -> Dict[str, Any]:
        payload = self._get_auth_audit_payload()
        key = str(email or "").strip().lower()
        row = self._default_auth_audit_record()
        row.update(payload.get(key) or {})
        row["email"] = key
        row["failed_attempts"] = 0
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        payload[key] = row
        self._save_auth_audit_payload(payload)
        return row

    # ------------------------------------------------------------------ #
    #  NETWORK SETTINGS + CONNECTION REQUESTS
    # ------------------------------------------------------------------ #

    def _normalize_id(self, value: Any) -> str:
        return str(value or "").strip()

    def _network_settings_scope(self, user_id: Any) -> str:
        normalized = self._normalize_id(user_id)
        return f"account_network_settings:{normalized or 'global'}"

    def _network_requests_scope(self) -> str:
        return "account_network_requests"

    def _network_connections_scope(self, user_id: Any) -> str:
        normalized = self._normalize_id(user_id)
        return f"account_network_connections:{normalized or 'global'}"

    def get_account_network_settings(self, user_id: Optional[Any] = None) -> Dict[str, Any]:
        payload = self._get_state_payload(self._network_settings_scope(user_id), {})
        return payload if isinstance(payload, dict) else {}

    def update_account_network_settings(self, patch: Dict[str, Any], user_id: Optional[Any] = None) -> Dict[str, Any]:
        current = self.get_account_network_settings(user_id)
        current.update(patch or {})
        current["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._upsert_state_payload(self._network_settings_scope(user_id), current)
        return current

    def list_account_network_requests(self) -> List[Dict[str, Any]]:
        payload = self._get_state_payload(self._network_requests_scope(), [])
        return payload if isinstance(payload, list) else []

    def get_account_network_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        for row in self.list_account_network_requests():
            if str(row.get("id")) == str(request_id):
                return row
        return None

    def create_account_network_request(self, data: Dict[str, Any]) -> Dict[str, Any]:
        rows = self.list_account_network_requests()
        now_iso = datetime.now(timezone.utc).isoformat()
        row = {
            "id": str(data.get("id") or uuid4()),
            "requester_id": data.get("requester_id"),
            "target_id": data.get("target_id"),
            "status": data.get("status", "pending"),
            "message": data.get("message"),
            "created_at": data.get("created_at") or now_iso,
            "updated_at": now_iso,
        }
        row.update(data or {})
        rows.append(row)
        self._upsert_state_payload(self._network_requests_scope(), rows)
        return row

    def update_account_network_request(self, request_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        rows = self.list_account_network_requests()
        found: Optional[Dict[str, Any]] = None
        for row in rows:
            if str(row.get("id")) == str(request_id):
                row.update(patch or {})
                row["updated_at"] = datetime.now(timezone.utc).isoformat()
                found = row
                break
        if found is None:
            return None
        self._upsert_state_payload(self._network_requests_scope(), rows)
        return found

    def list_user_connections(self, user_id: Any) -> List[Dict[str, Any]]:
        normalized_user_id = self._normalize_id(user_id)
        if not normalized_user_id:
            return []
        connections: List[Dict[str, Any]] = []
        for row in self.list_account_network_requests():
            if str(row.get("status", "")).strip().lower() != "accepted":
                continue
            requester_id = self._normalize_id(row.get("requester_id"))
            target_id = self._normalize_id(row.get("target_id"))
            if normalized_user_id in {requester_id, target_id}:
                connections.append(row)
        connections.sort(key=lambda item: str(item.get("updated_at") or item.get("created_at") or ""), reverse=True)
        return connections


@lru_cache(maxsize=1)
def get_supabase_db() -> SupabaseDB:
    return SupabaseDB()
