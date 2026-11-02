"""KYC & verification.

Identity documents are the most sensitive data the panel touches, so they get
their own rules:

* The document is **never proxied** through this API. An authorised reviewer
  asks for it and receives a signed URL that expires in minutes; the bytes never
  sit in an API response body or a log line.
* Opening a document is itself audited (who opened which request, when), so
  document access is reviewable.
* Approve / reject records the reviewer, the timestamp and the rejection reason,
  and is written both to the request row and to the audit log.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.security import AdminActor, audit, require_permission
from app.db.admin_store import AdminStore, AdminStoreError
from app.db.session import get_admin_db
from app.schemas.admin import KycDecision, Page, Pagination

router = APIRouter()

LIST_COLUMNS = (
    "id,user_id,account_type,document_type,document_hint,status,reason,"
    "reviewed_by,reviewed_at,created_at"
)


@router.get("", response_model=Page)
async def list_requests(
    pagination: Annotated[Pagination, Depends()],
    status_filter: str | None = Query(default=None, alias="status", pattern=r"^(pending|approved|rejected)$"),
    document_type: str | None = Query(default=None, max_length=30),
    admin: AdminActor = Depends(require_permission("kyc.view")),
    store: AdminStore = Depends(get_admin_db),
) -> Page:
    filters: dict[str, str] = {}
    if status_filter:
        filters["status"] = f"eq.{status_filter}"
    if document_type:
        filters["document_type"] = f"eq.{document_type}"
    rows, total = await store.select(
        "admin_kyc_requests",
        columns=LIST_COLUMNS,
        filters=filters,
        order="created_at.asc",
        limit=pagination.page_size,
        offset=pagination.offset,
        count=True,
    )

    # Attach the applicant so a reviewer sees a name, not a UUID.
    ids = [r["user_id"] for r in rows if r.get("user_id")]
    people: dict[str, dict[str, Any]] = {}
    if ids:
        profiles = await store.select(
            "profiles",
            columns="id,full_name,email,phone,role,account_status,details",
            filters={"id": f"in.({','.join(ids)})"},
        )
        people = {p["id"]: p for p in profiles}
    for row in rows:
        person = people.get(row.get("user_id")) or {}
        row["applicant"] = {
            "id": row.get("user_id"),
            "full_name": person.get("full_name"),
            "email": person.get("email"),
            "role": person.get("role"),
            "account_status": person.get("account_status"),
        }
        # The storage path is internal; the UI only ever sees a signed URL.
        row.pop("document_url", None)
    return Page(rows=rows, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/{request_id}/document")
async def open_document(
    request_id: str,
    request: Request,
    admin: AdminActor = Depends(require_permission("kyc.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Return a short-lived signed URL for one identity document."""
    rows = await store.select(
        "admin_kyc_requests",
        columns="id,user_id,document_type,document_url",
        filters={"id": f"eq.{request_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    row = rows[0]
    if not row.get("document_url"):
        raise HTTPException(status_code=409, detail="No document was attached to this request.")

    try:
        url = await store.signed_document_url(row["document_url"], expires_seconds=300)
    except AdminStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not url:
        raise HTTPException(status_code=409, detail="The document could not be opened.")

    # Accessing an identity document is a sensitive read: record it.
    await audit(
        store,
        request,
        admin,
        action="kyc.document.open",
        module="kyc",
        target_type="kyc_request",
        target_id=request_id,
        reason="Document opened for review",
    )
    return {"url": url, "expires_in": 300, "document_type": row.get("document_type")}


@router.post("/{request_id}/decision")
async def decide(
    request_id: str,
    payload: KycDecision,
    request: Request,
    admin: AdminActor = Depends(require_permission("kyc.review")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Approve or reject a verification request."""
    if payload.decision == "reject" and not (payload.reason or "").strip():
        raise HTTPException(status_code=422, detail="Give a reason for the rejection.")

    rows = await store.select(
        "admin_kyc_requests", columns="id,status,user_id", filters={"id": f"eq.{request_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Verification request not found.")
    if rows[0].get("status") != "pending":
        raise HTTPException(status_code=409, detail="This request has already been decided.")

    status_value = "approved" if payload.decision == "approve" else "rejected"
    now = datetime.now(tz=timezone.utc).isoformat()
    updated = await store.update(
        "admin_kyc_requests",
        {"status": status_value, "reason": payload.reason, "reviewed_by": admin.user_id, "reviewed_at": now},
        filters={"id": f"eq.{request_id}"},
    )

    await audit(
        store,
        request,
        admin,
        action=f"kyc.{status_value}",
        module="kyc",
        target_type="kyc_request",
        target_id=request_id,
        reason=payload.reason,
        before={"status": "pending"},
        after={"status": status_value},
    )
    return {"ok": True, "request": updated[0] if updated else None}


@router.get("/{request_id}/history")
async def history(
    request_id: str,
    admin: AdminActor = Depends(require_permission("kyc.view")),
    store: AdminStore = Depends(get_admin_db),
) -> dict[str, Any]:
    """Every admin action taken on one verification request."""
    rows = await store.select(
        "admin_audit_logs",
        columns="id,admin_email,admin_role,action,reason,before_state,after_state,created_at",
        filters={"module": "eq.kyc", "target_type": "eq.kyc_request", "target_id": f"eq.{request_id}"},
        order="created_at.desc",
        limit=50,
    )
    return {"rows": rows}
