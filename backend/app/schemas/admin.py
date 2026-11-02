"""Shared request/response models for the admin panel.

Pydantic models are the only place a client-supplied value becomes trusted:
FastAPI validates the body before a route body runs, so an endpoint can assume
types and lengths are already correct. Anything sensitive (reasons for a
suspension, before/after snapshots) is bounded here too, which keeps the audit
table from being used as a free-text dumping ground.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

AccountStatus = Literal["active", "pending", "suspended", "blocked"]
ModerationAction = Literal["approve", "reject", "hide", "remove", "restore", "restrict", "feature", "unfeature"]
TicketStatus = Literal["open", "in_progress", "waiting_user", "resolved", "closed"]
TicketPriority = Literal["low", "normal", "high", "urgent"]


class Page(BaseModel):
    """Pagination envelope every list endpoint returns."""

    rows: list[dict]
    total: int | None = None
    page: int = 1
    page_size: int = 25


class Pagination(BaseModel):
    page: int = Field(default=1, ge=1, le=10_000)
    page_size: int = Field(default=25, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class ReasonPayload(BaseModel):
    """A consequential action always carries a human reason."""

    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason")
    @classmethod
    def _trim(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < 3:
            raise ValueError("Give a reason of at least 3 characters.")
        return trimmed


class AccountAction(ReasonPayload):
    status: AccountStatus
    # Typed confirmation: the caller must echo the account's email. An accidental
    # click or a stale tab cannot suspend the wrong person.
    confirm_email: str = Field(min_length=3, max_length=320)


class RoleAssignment(ReasonPayload):
    role_key: str = Field(min_length=2, max_length=40)
    is_active: bool = True
    extra_permissions: list[str] = Field(default_factory=list, max_length=50)


class RolePermissionUpdate(BaseModel):
    permission_keys: list[str] = Field(min_length=0, max_length=200)
    reason: str = Field(min_length=3, max_length=500)


class KycDecision(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=500)


class ModerationRequest(BaseModel):
    action: ModerationAction
    reason: str | None = Field(default=None, max_length=500)


class DateRange(BaseModel):
    start: date | None = None
    end: date | None = None


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    assigned_to: str | None = None
    resolution: str | None = Field(default=None, max_length=2000)


class TicketMessage(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    is_internal: bool = False


class SettingsUpdate(BaseModel):
    values: dict[str, object]
    reason: str = Field(min_length=3, max_length=500)


class FlagUpdate(BaseModel):
    enabled: bool
    payload: dict | None = None
    reason: str = Field(min_length=3, max_length=500)


class CampaignCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=3, max_length=2000)
    channel: Literal["in_app", "email", "push"] = "in_app"
    audience_roles: list[str] = Field(default_factory=list, max_length=20)
    audience_states: list[str] = Field(default_factory=list, max_length=40)
    scheduled_at: str | None = None


class DeletionDecision(ReasonPayload):
    decision: Literal["approve", "reject"]
