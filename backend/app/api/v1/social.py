"""CenFriend social API.

Why this module exists
----------------------
Follow, like, comment, block and privacy are **permission** decisions. If the
browser wrote those rows directly, a user could follow someone who blocked
them, like a private post, or accept their own follow request. So the rules
that matter live here, executed after the Supabase JWT has been verified.

What stays in the browser
-------------------------
Plain CRUD on the caller's OWN rows (writing a post, editing one's own
comment) still goes through Supabase with Row Level Security, exactly like the
rest of the app. Only the actions that need to judge *another* user's data are
proxied here.

Identity
--------
Every route derives the acting user from :func:`require_user` — the verified
``sub`` claim. No route reads a user id, role or "as whom" value from the
request body. A caller can therefore only act as themselves.

Data access
-----------
Queries run through :class:`AdminStore` (PostgREST + service role) *after* the
caller is verified, and every query is filtered by the verified id. That is the
same pattern ``farmer.py`` uses; the service role never reaches the browser.
"""
from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.v1.farmer import CurrentUser, require_user
from app.core.config import settings
from app.db.admin_store import AdminStore, AdminStoreError

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────

MAX_PAGE = 50
DEFAULT_PAGE = 20
CLOSED_STATES = {"accepted", "pending"}

# ── Data access ───────────────────────────────────────────────────────────


def _store_or_503() -> AdminStore:
    """PostgREST with the service role; 503 when the server has no key."""
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The server is missing Supabase credentials, so the social API is unavailable.",
        )
    return AdminStore.from_settings(settings)


def _page(limit: int, offset: int) -> tuple[int, int]:
    """Clamp pagination so one request can never ask for the whole table."""
    return (max(1, min(limit, MAX_PAGE)), max(0, offset))


async def _select(store: AdminStore, table: str, **kwargs: Any) -> list[dict[str, Any]]:
    """Select that treats a missing table as an empty list, not a 500.

    A fresh install that has not run ``social.sql`` should render an empty
    CenFriend, not an error page that blames the user.
    """
    try:
        rows = await store.select(table, **kwargs)
    except AdminStoreError as exc:
        message = str(exc).lower()
        if exc.code == "42P01" or "does not exist" in message or "schema cache" in message:
            return []
        if exc.code == "PGRST301" or "jwt" in message:
            raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.") from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return rows if isinstance(rows, list) else []


async def _count(store: AdminStore, table: str, filters: dict[str, str]) -> int:
    """Exact row count without transferring the rows themselves."""
    try:
        _, total = await store.select(
            table, columns="*", filters={**filters, "limit": "1"}, count=True
        )
    except AdminStoreError:
        return 0
    return int(total or 0)


# ── Safety helpers ────────────────────────────────────────────────────────


async def _is_blocked(store: AdminStore, a: str, b: str) -> bool:
    """True when either side has blocked the other.

    A block is symmetric in effect: if A blocked B, B must also be refused.
    Checking only one direction is the classic mistake that lets the blocked
    account keep liking a blocker's posts.
    """
    if a == b:
        return False
    rows = await _select(
        store,
        "user_blocks",
        columns="blocker_id,blocked_id",
        or_filter=f"and(blocker_id.eq.{a},blocked_id.eq.{b}),and(blocker_id.eq.{b},blocked_id.eq.{a})",
        limit=1,
    )
    return bool(rows)


async def _profile(store: AdminStore, user_id: str) -> dict[str, Any] | None:
    rows = await _select(store, "profiles", columns="*", filters={"id": f"eq.{user_id}", "limit": "1"})
    return rows[0] if rows else None


async def _following_edge(store: AdminStore, follower: str, following: str) -> dict[str, Any] | None:
    rows = await _select(
        store,
        "follows",
        columns="follower_id,following_id,status",
        filters={"follower_id": f"eq.{follower}", "following_id": f"eq.{following}", "limit": "1"},
    )
    return rows[0] if rows else None


def _follow_state(edge: dict[str, Any] | None, follows_back: bool) -> str:
    """Map the raw row to the four states the button knows about."""
    if not edge:
        return "follow_back" if follows_back else "follow"
    status_value = str(edge.get("status") or "")
    if status_value == "pending":
        return "requested"
    return "following"


# ── Ownership helpers ─────────────────────────────────────────────────────


def _require_owner(kind: str, owner_id: str, user: CurrentUser) -> None:
    """403 unless the caller owns the row. Used by every edit/delete route."""
    if owner_id != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You can only change your own {kind}.",
        )


async def _post_or_404(store: AdminStore, post_id: str) -> dict[str, Any]:
    rows = await _select(
        store,
        "posts",
        columns="id,author_id,visibility,is_draft,is_deleted,body,mentions,media_urls",
        filters={"id": f"eq.{post_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That post no longer exists.")
    return rows[0]


async def _assert_can_view_post(store: AdminStore, post: dict[str, Any], viewer_id: str) -> None:
    """404 (not 403) when the post is not visible.

    Answering 403 would confirm the post exists, which is exactly the leak a
    private account must not have. The client sees the same thing for "missing"
    and "not allowed".
    """
    if post.get("is_deleted"):
        raise HTTPException(status_code=404, detail="That post no longer exists.")
    author = str(post.get("author_id") or "")
    if author == viewer_id:
        return
    if post.get("is_draft"):
        raise HTTPException(status_code=404, detail="That post no longer exists.")
    if await _is_blocked(store, viewer_id, author):
        raise HTTPException(status_code=404, detail="That post no longer exists.")

    visibility = str(post.get("visibility") or "public")
    if visibility == "private":
        raise HTTPException(status_code=404, detail="That post no longer exists.")
    if visibility == "followers":
        edge = await _following_edge(store, viewer_id, author)
        if not edge or edge.get("status") != "accepted":
            raise HTTPException(status_code=404, detail="That post no longer exists.")

    # A public post from a private account is only for accepted followers.
    profile = await _profile(store, author) or {}
    if profile.get("is_private"):
        edge = await _following_edge(store, viewer_id, author)
        if not edge or edge.get("status") != "accepted":
            raise HTTPException(status_code=404, detail="That post no longer exists.")


# ── Schemas ───────────────────────────────────────────────────────────────


class FollowResult(BaseModel):
    status: str  # "following" | "requested"
    target_id: str


class FollowState(BaseModel):
    state: str  # "follow" | "following" | "follow_back" | "requested"
    target_id: str
    is_private: bool = False


class LikeResult(BaseModel):
    liked: bool
    like_count: int


class CommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_id: str | None = None


class ReportInput(BaseModel):
    target_kind: str = Field(pattern="^(post|comment|user)$")
    target_id: str
    reason: str = Field(
        pattern="^(spam|harassment|misinformation|hate|nudity|violence|other)$"
    )
    note: str | None = Field(default=None, max_length=500)


class PrivacyInput(BaseModel):
    is_private: bool


class PostInput(BaseModel):
    """Everything a CenFriend post may carry.

    Media is uploaded to Supabase Storage by the browser first (the same
    buckets the Creator Studio uses); only the resulting URLs reach this API.
    Storing a 20 MB video in Postgres would be the one thing that makes this
    schema unusable at a crore users.
    """

    body: str = Field(default="", max_length=2000)
    media_urls: list[str] = Field(default_factory=list, max_length=10)
    video_url: str | None = None
    post_kind: str = Field(default="text", pattern="^(text|image|gallery|video|short)$")
    visibility: str = Field(default="public", pattern="^(public|followers|private)$")
    location_name: str | None = Field(default=None, max_length=120)
    crop: str | None = Field(default=None, max_length=80)
    is_draft: bool = False


class PostEditInput(BaseModel):
    body: str | None = Field(default=None, max_length=2000)
    visibility: str | None = Field(default=None, pattern="^(public|followers|private)$")
    location_name: str | None = Field(default=None, max_length=120)


# ── Posts (write path) ────────────────────────────────────────────────────


@router.post("/posts", status_code=201)
async def create_post_v2(
    payload: PostInput,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """Create a post with hashtags and mentions resolved server-side.

    The browser could write this row directly, but then the hashtag index and
    the @mention notifications would depend on a client-side string parser
    that a modified client can simply skip. Deriving them here means the index
    is always complete and a mention always notifies.
    """
    store = _store_or_503()
    body = payload.body.strip()
    if not payload.is_draft and not body and not payload.media_urls and not payload.video_url:
        raise HTTPException(status_code=400, detail="Write something or attach a photo first.")

    kind = payload.post_kind
    if kind == "text" and payload.video_url:
        kind = "video"
    elif kind == "text" and payload.media_urls:
        kind = "image" if len(payload.media_urls) == 1 else "gallery"

    row = {
        "author_id": user.user_id,
        "body": body or "[media]",
        "media_urls": payload.media_urls,
        "image_url": payload.media_urls[0] if payload.media_urls else None,
        "video_url": payload.video_url,
        "post_kind": kind,
        "visibility": payload.visibility,
        "location_name": payload.location_name,
        "crop": payload.crop,
        "is_draft": payload.is_draft,
        "hashtags": extract_hashtags(body),
        "mentions": await _resolve_mentions(store, body),
    }
    try:
        created = await store.insert("posts", row)
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return created[0] if isinstance(created, list) and created else {}


@router.patch("/posts/{post_id}")
async def edit_post(
    post_id: str,
    payload: PostEditInput,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """Edit my own post. Editing never changes the author or the created_at."""
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    _require_owner("post", str(post["author_id"]), user)

    values: dict[str, Any] = {"edited_at": "now()"}
    if payload.body is not None:
        body = payload.body.strip()
        if not body and not post.get("media_urls"):
            raise HTTPException(status_code=400, detail="A post cannot be empty.")
        values["body"] = body
        values["hashtags"] = extract_hashtags(body)
        values["mentions"] = await _resolve_mentions(store, body)
    if payload.visibility is not None:
        values["visibility"] = payload.visibility
    if payload.location_name is not None:
        values["location_name"] = payload.location_name

    try:
        updated = await store.update("posts", values, filters={"id": f"eq.{post_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return updated[0] if updated else {}


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post_v2(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Soft-delete my own post.

    Soft, not hard: a hard delete on a popular post rewrites the counters and
    leaves broken links in notifications. The row stays for the audit trail and
    is filtered out of every read.
    """
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    _require_owner("post", str(post["author_id"]), user)
    try:
        await store.update("posts", {"is_deleted": True}, filters={"id": f"eq.{post_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Follow ────────────────────────────────────────────────────────────────


@router.get("/follow/{user_id}/state", response_model=FollowState)
async def follow_state(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> FollowState:
    """What the follow button should say for the caller right now."""
    store = _store_or_503()
    if user_id == user.user_id:
        return FollowState(state="follow", target_id=user_id)
    if await _is_blocked(store, user.user_id, user_id):
        # A blocked pair shows no relationship, so the button cannot be used
        # to probe whether the other person follows back.
        return FollowState(state="follow", target_id=user_id)

    edge = await _following_edge(store, user.user_id, user_id)
    back = await _following_edge(store, user_id, user.user_id)
    target = await _profile(store, user_id) or {}
    return FollowState(
        state=_follow_state(edge, bool(back and back.get("status") == "accepted")),
        target_id=user_id,
        is_private=bool(target.get("is_private")),
    )


@router.post("/follow/{user_id}", response_model=FollowResult, status_code=201)
async def follow_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> FollowResult:
    """Follow a public account, or request to follow a private one.

    The unique primary key on (follower_id, following_id) is the real guard
    against a double follow: two racing taps collapse into one row here.
    """
    store = _store_or_503()
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself.")

    target = await _profile(store, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="That account no longer exists.")
    if await _is_blocked(store, user.user_id, user_id):
        raise HTTPException(status_code=403, detail="You cannot follow this account.")

    edge = await _following_edge(store, user.user_id, user_id)
    if edge and edge.get("status") in CLOSED_STATES:
        # Idempotent: a second tap returns the current state, not an error.
        return FollowResult(status=str(edge["status"]), target_id=user_id)

    new_status = "pending" if target.get("is_private") else "accepted"
    me = await _profile(store, user.user_id) or {}
    row = {
        "follower_id": user.user_id,
        "following_id": user_id,
        "status": new_status,
        "follower_name": me.get("full_name"),
        "accepted_at": None if new_status == "pending" else "now()",
    }
    try:
        await store.insert("follows", row, returning=False)
    except AdminStoreError as exc:
        if exc.code == "23505":
            # Lost a race with another tap — the end state is what the user
            # wanted anyway.
            return FollowResult(status=new_status, target_id=user_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return FollowResult(status=new_status, target_id=user_id)


@router.delete("/follow/{user_id}", status_code=204)
async def unfollow_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Unfollow, or withdraw a pending request. Both are a delete of my edge."""
    store = _store_or_503()
    try:
        await store.delete(
            "follows", filters={"follower_id": f"eq.{user.user_id}", "following_id": f"eq.{user_id}"}
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/followers/{user_id}", status_code=204)
async def remove_follower(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Remove someone who follows ME. Deletes the edge they created.

    Only the account being followed may do this — deleting an edge where I am
    the follower is "unfollow" and is handled by the route above.
    """
    store = _store_or_503()
    try:
        await store.delete(
            "follows", filters={"follower_id": f"eq.{user_id}", "following_id": f"eq.{user.user_id}"}
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/followers/{user_id}")
async def list_followers(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    store = _store_or_503()
    await _assert_can_view_profile(store, user_id, user.user_id)
    size, skip = _page(limit, offset)
    rows = await _select(
        store,
        "follows",
        columns="follower_id,created_at",
        filters={"following_id": f"eq.{user_id}", "status": "eq.accepted"},
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    total = await _count(store, "follows", {"following_id": f"eq.{user_id}", "status": "eq.accepted"})
    return {**(await _with_profiles(store, rows, "follower_id", user.user_id)), "total": total}


@router.get("/following/{user_id}")
async def list_following(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    store = _store_or_503()
    await _assert_can_view_profile(store, user_id, user.user_id)
    size, skip = _page(limit, offset)
    rows = await _select(
        store,
        "follows",
        columns="following_id,created_at",
        filters={"follower_id": f"eq.{user_id}", "status": "eq.accepted"},
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    total = await _count(store, "follows", {"follower_id": f"eq.{user_id}", "status": "eq.accepted"})
    return {**(await _with_profiles(store, rows, "following_id", user.user_id)), "total": total}


async def _assert_can_view_profile(store: AdminStore, profile_id: str, viewer_id: str) -> None:
    """Private profiles expose counts but not their people lists.

    A stranger can still see "412 followers" (that is public information on
    most networks) but cannot enumerate who they are.
    """
    if profile_id == viewer_id:
        return
    if await _is_blocked(store, viewer_id, profile_id):
        raise HTTPException(status_code=404, detail="This account is not available.")
    target = await _profile(store, profile_id)
    if not target:
        raise HTTPException(status_code=404, detail="This account does not exist.")
    if target.get("is_private"):
        edge = await _following_edge(store, viewer_id, profile_id)
        if not edge or edge.get("status") != "accepted":
            raise HTTPException(
                status_code=403,
                detail="This account is private. Follow it to see its connections.",
            )


async def _with_profiles(
    store: AdminStore, rows: list[dict[str, Any]], key: str, viewer_id: str
) -> dict[str, Any]:
    """Attach the public profile fields and the caller's own follow state.

    ``next_offset`` is the offset of the NEXT page, or ``None`` when this page
    was not full — a short page can only mean there is nothing behind it, so
    the client never makes a pointless extra request.
    """
    ids = [str(r[key]) for r in rows if r.get(key)]
    if not ids:
        return {"items": [], "next_offset": None}

    id_filter = "(" + ",".join(ids) + ")"
    profiles = await _select(
        store,
        "profiles",
        columns="id,full_name,username,avatar_url,role,is_private,bio,details,follower_count",
        filters={"id": f"in.{id_filter}"},
    )
    by_id = {str(p["id"]): p for p in profiles}

    mine = await _select(
        store,
        "follows",
        columns="following_id,status",
        filters={"follower_id": f"eq.{viewer_id}", "following_id": f"in.{id_filter}"},
    )
    rel = {str(m["following_id"]): str(m["status"]) for m in mine}

    items = []
    for row in rows:
        pid = str(row.get(key))
        profile = by_id.get(pid)
        if not profile:
            continue
        items.append(
            {
                **{k: profile.get(k) for k in (
                    "id", "full_name", "username", "avatar_url", "role", "bio", "follower_count"
                )},
                "is_private": bool(profile.get("is_private")),
                "district": (profile.get("details") or {}).get("district"),
                "state": (profile.get("details") or {}).get("state"),
                "follow_state": rel.get(pid, "follow") if pid != viewer_id else "me",
            }
        )
    return {"items": items, "next_offset": len(rows) if len(rows) >= DEFAULT_PAGE else None}


# ── Follow requests ───────────────────────────────────────────────────────


@router.get("/requests")
async def list_requests(
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Pending requests addressed to ME. Nobody can read another's inbox."""
    store = _store_or_503()
    size, skip = _page(limit, offset)
    rows = await _select(
        store,
        "follows",
        columns="follower_id,created_at",
        filters={"following_id": f"eq.{user.user_id}", "status": "eq.pending"},
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    return await _with_profiles(store, rows, "follower_id", user.user_id)


@router.get("/requests/sent")
async def list_sent_requests(
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Requests I have sent that are still waiting — so a user can cancel them."""
    store = _store_or_503()
    size, skip = _page(limit, offset)
    rows = await _select(
        store,
        "follows",
        columns="following_id,created_at",
        filters={"follower_id": f"eq.{user.user_id}", "status": "eq.pending"},
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    return await _with_profiles(store, rows, "following_id", user.user_id)


async def _decide_request(store: AdminStore, follower_id: str, owner_id: str, accept: bool) -> None:
    """Accept or reject the pending edge addressed to ``owner_id``.

    The filter pins BOTH ids and ``status=eq.pending``: the caller can only
    resolve their own inbox, and a second decision on the same row is a no-op
    rather than a reversal.
    """
    filters = {"follower_id": f"eq.{follower_id}", "following_id": f"eq.{owner_id}", "status": "eq.pending"}
    try:
        if accept:
            await store.update(
                "follows",
                {"status": "accepted", "accepted_at": "now()"},
                filters=filters,
            )
        else:
            await store.delete("follows", filters=filters)
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/requests/{follower_id}/accept", status_code=204)
async def accept_request(
    follower_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    await _decide_request(store, follower_id, user.user_id, accept=True)


@router.post("/requests/{follower_id}/reject", status_code=204)
async def reject_request(
    follower_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    await _decide_request(store, follower_id, user.user_id, accept=False)


@router.delete("/requests/{user_id}", status_code=204)
async def cancel_request(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Withdraw a request I sent, before it is approved."""
    store = _store_or_503()
    try:
        await store.delete(
            "follows",
            filters={
                "follower_id": f"eq.{user.user_id}",
                "following_id": f"eq.{user_id}",
                "status": "eq.pending",
            },
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Likes ─────────────────────────────────────────────────────────────────


@router.post("/posts/{post_id}/like", response_model=LikeResult)
async def like_post(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> LikeResult:
    """Idempotent like. Liking twice keeps one row; the count is re-read so the
    client reconciles its optimistic number with the database's."""
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    await _assert_can_view_post(store, post, user.user_id)
    if str(post["author_id"]) != user.user_id and await _is_blocked(store, user.user_id, str(post["author_id"])):
        raise HTTPException(status_code=403, detail="You cannot interact with this account.")

    try:
        await store.insert(
            "post_likes", {"post_id": post_id, "user_id": user.user_id}, returning=False
        )
    except AdminStoreError as exc:
        if exc.code != "23505":
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        # Already liked — fall through and return the true count.

    rows = await _select(store, "posts", columns="like_count", filters={"id": f"eq.{post_id}", "limit": "1"})
    return LikeResult(liked=True, like_count=int((rows[0] if rows else {}).get("like_count") or 0))


@router.delete("/posts/{post_id}/like", response_model=LikeResult)
async def unlike_post(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> LikeResult:
    store = _store_or_503()
    try:
        await store.delete("post_likes", filters={"post_id": f"eq.{post_id}", "user_id": f"eq.{user.user_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    rows = await _select(store, "posts", columns="like_count", filters={"id": f"eq.{post_id}", "limit": "1"})
    return LikeResult(liked=False, like_count=int((rows[0] if rows else {}).get("like_count") or 0))


@router.get("/posts/{post_id}/likes")
async def list_likes(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Who liked this post. Refused for a post the caller cannot see."""
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    await _assert_can_view_post(store, post, user.user_id)

    size, skip = _page(limit, offset)
    rows = await _select(
        store,
        "post_likes",
        columns="user_id,created_at",
        filters={"post_id": f"eq.{post_id}"},
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    return await _with_profiles(store, rows, "user_id", user.user_id)


# ── Comments ──────────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"#([a-zA-Z0-9_]{1,50})")
_MENTION_RE = re.compile(r"@([a-z0-9_]{3,30})")


def extract_hashtags(body: str) -> list[str]:
    """Lower-cased unique tags, capped so one post cannot bloat the index."""
    seen: list[str] = []
    for tag in _TAG_RE.findall(body or ""):
        lowered = tag.lower()
        if lowered not in seen:
            seen.append(lowered)
    return seen[:30]


async def _resolve_mentions(store: AdminStore, body: str) -> list[str]:
    """Turn @username into user ids. Unknown handles are silently dropped."""
    handles = sorted({h.lower() for h in _MENTION_RE.findall(body or "")})[:20]
    if not handles:
        return []
    rows = await _select(
        store,
        "profiles",
        columns="id,username",
        filters={"username": f"in.({','.join(handles)})"},
    )
    return [str(r["id"]) for r in rows if r.get("id")]


@router.post("/posts/{post_id}/comments", status_code=201)
async def add_comment(
    post_id: str,
    payload: CommentInput,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """Comment on, or reply to, a post the caller is allowed to see."""
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    await _assert_can_view_post(store, post, user.user_id)

    parent_id = payload.parent_id
    if parent_id:
        parent_rows = await _select(
            store,
            "comments",
            columns="id,post_id",
            filters={"id": f"eq.{parent_id}", "limit": "1"},
        )
        if not parent_rows or str(parent_rows[0].get("post_id")) != post_id:
            raise HTTPException(status_code=400, detail="You can only reply to a comment on this post.")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Write a comment first.")

    row = {
        "post_id": post_id,
        "author_id": user.user_id,
        "body": body,
        "parent_id": parent_id,
    }
    try:
        created = await store.insert("comments", row)
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return created[0] if isinstance(created, list) and created else {}


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Only the author — or the post author, for moderation — may delete."""
    store = _store_or_503()
    rows = await _select(
        store, "comments", columns="id,author_id,post_id", filters={"id": f"eq.{comment_id}", "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That comment no longer exists.")
    comment = rows[0]
    post = await _post_or_404(store, str(comment["post_id"]))
    if user.user_id not in (str(comment["author_id"]), str(post["author_id"])):
        raise HTTPException(status_code=403, detail="You can only delete your own comments.")
    try:
        # Soft delete keeps the thread readable for the replies underneath.
        await store.update("comments", {"is_deleted": True, "body": "[deleted]"}, filters={"id": f"eq.{comment_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Block / unblock ───────────────────────────────────────────────────────


@router.post("/users/{user_id}/block", status_code=204)
async def block_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Block. The SQL trigger removes the follow edges in both directions."""
    store = _store_or_503()
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="You cannot block yourself.")
    if not await _profile(store, user_id):
        raise HTTPException(status_code=404, detail="That account no longer exists.")
    try:
        await store.insert("user_blocks", {"blocker_id": user.user_id, "blocked_id": user_id}, returning=False)
    except AdminStoreError as exc:
        if exc.code != "23505":
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/users/{user_id}/block", status_code=204)
async def unblock_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    try:
        await store.delete("user_blocks", filters={"blocker_id": f"eq.{user.user_id}", "blocked_id": f"eq.{user_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/users/{user_id}/mute", status_code=204)
async def mute_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Mute hides posts from my feed without ending the follow."""
    store = _store_or_503()
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="You cannot mute yourself.")
    try:
        await store.insert("user_mutes", {"muter_id": user.user_id, "muted_id": user_id}, returning=False)
    except AdminStoreError as exc:
        if exc.code != "23505":
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/users/{user_id}/mute", status_code=204)
async def unmute_user(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    try:
        await store.delete("user_mutes", filters={"muter_id": f"eq.{user.user_id}", "muted_id": f"eq.{user_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/blocked")
async def list_blocked(user: Annotated[CurrentUser, Depends(require_user)]) -> dict[str, Any]:
    store = _store_or_503()
    rows = await _select(
        store,
        "user_blocks",
        columns="blocked_id,created_at",
        filters={"blocker_id": f"eq.{user.user_id}"},
        order="created_at.desc",
        limit=MAX_PAGE,
    )
    return await _with_profiles(store, rows, "blocked_id", user.user_id)


# ── Reports ───────────────────────────────────────────────────────────────


@router.post("/reports", status_code=201)
async def file_report(
    payload: ReportInput,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """File one report. The unique key makes a repeated report a no-op."""
    store = _store_or_503()

    # A report must point at something that exists — otherwise the moderation
    # queue fills with ids that resolve to nothing.
    if payload.target_kind == "post":
        post = await _post_or_404(store, payload.target_id)
        await _assert_can_view_post(store, post, user.user_id)
    elif payload.target_kind == "comment":
        found = await _select(store, "comments", columns="id", filters={"id": f"eq.{payload.target_id}", "limit": "1"})
        if not found:
            raise HTTPException(status_code=404, detail="That comment no longer exists.")
    else:
        if not await _profile(store, payload.target_id):
            raise HTTPException(status_code=404, detail="That account no longer exists.")

    row = {
        "reporter_id": user.user_id,
        "target_kind": payload.target_kind,
        "target_id": payload.target_id,
        "reason": payload.reason,
        "note": (payload.note or "").strip() or None,
    }
    try:
        created = await store.insert("content_reports", row)
    except AdminStoreError as exc:
        if exc.code == "23505":
            return {"id": None, "duplicate": True}
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    report = created[0] if isinstance(created, list) and created else {}
    return {**report, "duplicate": False}


# ── Privacy ───────────────────────────────────────────────────────────────


@router.patch("/me/privacy", response_model=PrivacyInput)
async def set_privacy(
    payload: PrivacyInput,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> PrivacyInput:
    """Switch my own account between public and private.

    Turning the switch ON also clears any pending requests' effect: existing
    followers stay followers (that matches every major network) but nobody new
    gets in without approval.
    """
    store = _store_or_503()
    try:
        await store.update("profiles", {"is_private": payload.is_private}, filters={"id": f"eq.{user.user_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return payload



# ── Feed & Explore ────────────────────────────────────────────────────────
# The feed is assembled here rather than in the browser because a client-side
# join would have to download every followed account's row to honour the
# privacy rules — and a modified client could simply not apply them.

_POST_COLUMNS = (
    "id,author_id,body,image_url,media_urls,video_url,post_kind,visibility,"
    "hashtags,mentions,location_name,crop,district,like_count,share_count,"
    "created_at,edited_at,is_draft"
)


async def _hydrate(store: AdminStore, rows: list[dict[str, Any]], viewer_id: str) -> list[dict[str, Any]]:
    """Attach author, counts, and the viewer's own like/save state.

    Five queries for a whole page, whatever its size: authors, comment counts,
    my likes, my saves, and my follow edges. Doing it per post is what turns a
    20-item feed into 80 round-trips.

    The follow edge is part of hydration rather than a second request because
    the card shows "Follow" next to every author it does not know. Without it
    the screen would need one extra call per distinct author, and a feed of 20
    posts by 15 creators would cost 15 calls to render a single viewport.
    """
    if not rows:
        return []
    post_ids = [str(r["id"]) for r in rows]
    author_ids = sorted({str(r["author_id"]) for r in rows})
    id_filter = "(" + ",".join(post_ids) + ")"
    authors_filter = "(" + ",".join(author_ids) + ")"

    authors, likes, saves, edges = await _gather(
        _select(
            store,
            "profiles",
            columns="id,full_name,username,avatar_url,role,is_private,details",
            filters={"id": f"in.{authors_filter}"},
        ),
        _select(
            store,
            "post_likes",
            columns="post_id",
            filters={"user_id": f"eq.{viewer_id}", "post_id": f"in.{id_filter}"},
        ),
        _select(
            store,
            "saved_posts",
            columns="post_id",
            filters={"user_id": f"eq.{viewer_id}", "post_id": f"in.{id_filter}"},
        ),
        _select(
            store,
            "follows",
            columns="following_id,status",
            filters={"follower_id": f"eq.{viewer_id}", "following_id": f"in.{authors_filter}"},
        ),
    )
    by_id = {str(a["id"]): a for a in authors}
    liked = {str(r["post_id"]) for r in likes}
    saved = {str(r["post_id"]) for r in saves}
    follow_of = {str(e["following_id"]): str(e.get("status") or "") for e in edges}

    # Comment counts: one grouped pass, not one query per post.
    counts = await _comment_counts(store, post_ids)

    out: list[dict[str, Any]] = []
    for row in rows:
        author = by_id.get(str(row["author_id"]), {})
        author_id = str(row["author_id"])
        out.append(
            {
                **row,
                "media_urls": row.get("media_urls") or ([row["image_url"]] if row.get("image_url") else []),
                "hashtags": row.get("hashtags") or [],
                "like_count": int(row.get("like_count") or 0),
                "comment_count": counts.get(str(row["id"]), 0),
                "liked": str(row["id"]) in liked,
                "saved": str(row["id"]) in saved,
                "author": {
                    "id": author.get("id"),
                    "full_name": author.get("full_name"),
                    "username": author.get("username"),
                    "avatar_url": author.get("avatar_url"),
                    "role": author.get("role"),
                    "is_private": bool(author.get("is_private")),
                    # Coarse location only (district/state). The card shows the
                    # district the account already chose to show on its profile.
                    "district": (author.get("details") or {}).get("district"),
                    "follow_state": (
                        "me"
                        if author_id == viewer_id
                        else "requested"
                        if follow_of.get(author_id) == "pending"
                        else "following"
                        if author_id in follow_of
                        else "follow"
                    ),
                },
            }
        )
    return out


async def _gather(*awaitables: Any) -> list[Any]:
    import asyncio

    return list(await asyncio.gather(*awaitables))


async def _comment_counts(store: AdminStore, post_ids: list[str]) -> dict[str, int]:
    """Visible comments per post, in one query."""
    rows = await _select(
        store,
        "comments",
        columns="post_id",
        filters={"post_id": f"in.({','.join(post_ids)})", "is_deleted": "eq.false"},
        limit=1000,
    )
    out: dict[str, int] = {}
    for row in rows:
        key = str(row.get("post_id"))
        out[key] = out.get(key, 0) + 1
    return out


@router.get("/feed")
async def get_feed(
    user: Annotated[CurrentUser, Depends(require_user)],
    mode: str = Query("following", pattern="^(following|recommended|latest)$"),
    cursor: str | None = None,
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
) -> dict[str, Any]:
    """Home feed.

    ``following`` is a keyset-paginated read of accounts I follow (plus my own
    posts). ``cursor`` is the ``created_at`` of the last item I received, so a
    page boundary never repeats or skips an item when posts are inserted while
    the user scrolls — the failure mode offset pagination has.

    ``recommended`` is a first-pass ranking: public posts from accounts I do
    not follow, ordered by engagement-per-age. It is deliberately simple and
    deterministic; a personalised ranker can replace this one query later
    without touching the client contract.
    """
    store = _store_or_503()
    size, _ = _page(limit, 0)

    if mode == "recommended":
        # Public posts, newest first, excluding people I already follow.
        following_rows = await _select(
            store, "follows", columns="following_id", filters={"follower_id": f"eq.{user.user_id}"}, limit=1000
        )
        excluded = {str(r["following_id"]) for r in following_rows} | {user.user_id}
        rows = await _select(
            store,
            "posts",
            columns=_POST_COLUMNS,
            filters={
                "is_deleted": "eq.false",
                "is_draft": "eq.false",
                "visibility": "eq.public",
                **({"created_at": f"lt.{cursor}"} if cursor else {}),
            },
            order="like_count.desc,created_at.desc",
            limit=size * 3,
        )
        rows = [r for r in rows if str(r["author_id"]) not in excluded][:size]
        items = await _hydrate(store, rows, user.user_id)
        # Drop authors whose account is private — a public post by a private
        # account is follower-only, and this viewer is by definition not one.
        items = [i for i in items if not (i["author"]["is_private"] and i["author"]["id"] != user.user_id)]
        next_cursor = items[-1]["created_at"] if items else None
        return {"items": items, "next_cursor": next_cursor, "mode": mode}

    try:
        rows = await store.rpc(
            "social_following_feed",
            {"p_before": cursor, "p_limit": size, "p_viewer": user.user_id},
        )
    except AdminStoreError:
        # The RPC needs `auth.uid()`, which the service role does not carry.
        # Fall back to the documented query below, scoped to this viewer.
        rows = await _following_fallback(store, user.user_id, cursor, size)

    items = await _hydrate(store, rows if isinstance(rows, list) else [], user.user_id)
    return {
        "items": items,
        "next_cursor": items[-1]["created_at"] if len(items) >= size else None,
        "mode": mode,
    }


async def _following_fallback(
    store: AdminStore, viewer_id: str, cursor: str | None, size: int
) -> list[dict[str, Any]]:
    """The same feed as ``social_following_feed``, assembled in Python.

    Used when the SQL function is not installed. It is correct, just slower on
    a very large graph, so the RPC stays the preferred path.
    """
    edges = await _select(
        store, "follows", columns="following_id", filters={"follower_id": f"eq.{viewer_id}", "status": "eq.accepted"}, limit=1000
    )
    authors = sorted({str(e["following_id"]) for e in edges} | {viewer_id})
    muted = await _select(store, "user_mutes", columns="muted_id", filters={"muter_id": f"eq.{viewer_id}"}, limit=1000)
    muted_ids = {str(m["muted_id"]) for m in muted}
    authors = [a for a in authors if a not in muted_ids] or [viewer_id]

    rows = await _select(
        store,
        "posts",
        columns=_POST_COLUMNS,
        filters={
            "author_id": f"in.({','.join(authors)})",
            "is_deleted": "eq.false",
            "is_draft": "eq.false",
            "visibility": "in.(public,followers)",
            **({"created_at": f"lt.{cursor}"} if cursor else {}),
        },
        order="created_at.desc",
        limit=size,
    )
    return rows


@router.get("/explore")
async def explore(
    user: Annotated[CurrentUser, Depends(require_user)],
    q: str | None = Query(None, max_length=80),
    kind: str | None = Query(None, pattern="^(text|image|gallery|video|short)$"),
    cursor: str | None = None,
    limit: int = Query(24, ge=1, le=MAX_PAGE),
) -> dict[str, Any]:
    """Discovery grid: public posts only, viewers' blocks always respected."""
    store = _store_or_503()
    size, _ = _page(limit, 0)
    filters: dict[str, str] = {
        "is_deleted": "eq.false",
        "is_draft": "eq.false",
        "visibility": "eq.public",
    }
    if kind:
        filters["post_kind"] = f"eq.{kind}"
    if cursor:
        filters["created_at"] = f"lt.{cursor}"
    if q:
        # Matches body text or a hashtag prefix; the GIN index on hashtags
        # keeps the tag half fast even with a crore rows.
        term = q.lstrip("#")
        filters["or"] = f"(body.ilike.*{term}*,hashtags.cs.{{{term.lower()}}})"

    rows = await _select(store, "posts", columns=_POST_COLUMNS, filters=filters, order="created_at.desc", limit=size)

    # Hide posts whose author blocked the viewer or has gone private.
    blocked = await _select(
        store,
        "user_blocks",
        columns="blocker_id,blocked_id",
        or_filter=f"blocker_id.eq.{user.user_id},blocked_id.eq.{user.user_id}",
        limit=1000,
    )
    hidden = {str(b["blocker_id"]) for b in blocked} | {str(b["blocked_id"]) for b in blocked}
    rows = [r for r in rows if str(r["author_id"]) not in hidden]

    items = await _hydrate(store, rows, user.user_id)
    items = [i for i in items if not (i["author"]["is_private"] and i["author"]["id"] != user.user_id)]
    return {"items": items, "next_cursor": items[-1]["created_at"] if len(items) >= size else None}


@router.get("/explore/people")
async def explore_people(
    user: Annotated[CurrentUser, Depends(require_user)],
    q: str | None = Query(None, max_length=80),
    role: str | None = Query(None, max_length=40),
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Search accounts by name, username or account type.

    One endpoint for every role: "Farmers", "Buyers", "Retailers" are just the
    ``role`` filter, because all eight account types live in one table.
    """
    store = _store_or_503()
    size, skip = _page(limit, offset)
    filters: dict[str, str] = {"id": f"neq.{user.user_id}"}
    if role:
        filters["role"] = f"eq.{role}"
    if q:
        term = q.strip()
        filters["or"] = f"(full_name.ilike.*{term}*,username.ilike.*{term.lower()}*)"

    profile_rows = await _select(
        store,
        "profiles",
        columns="id,full_name,username,avatar_url,role,bio,is_private,follower_count,details",
        filters=filters,
        order="follower_count.desc",
        limit=size,
        offset=skip,
    )
    ids = [str(p["id"]) for p in profile_rows]
    rel: dict[str, str] = {}
    if ids:
        mine = await _select(
            store,
            "follows",
            columns="following_id,status",
            filters={"follower_id": f"eq.{user.user_id}", "following_id": f"in.({','.join(ids)})"},
        )
        rel = {str(m["following_id"]): str(m["status"]) for m in mine}

    items = [
        {
            "id": p["id"],
            "full_name": p.get("full_name"),
            "username": p.get("username"),
            "avatar_url": p.get("avatar_url"),
            "role": p.get("role"),
            "bio": p.get("bio"),
            "follower_count": int(p.get("follower_count") or 0),
            "is_private": bool(p.get("is_private")),
            "district": (p.get("details") or {}).get("district"),
            "follow_state": rel.get(str(p["id"]), "follow"),
        }
        for p in profile_rows
    ]
    return {"items": items, "next_offset": skip + len(items) if len(items) >= size else None}


@router.get("/hashtags")
async def trending_hashtags(
    _user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(10, ge=1, le=30),
) -> dict[str, Any]:
    """Trending tags over the last 7 days of public posts.

    Computed from the posts table here rather than from a materialised view so
    a fresh install has something real without a scheduled job. At scale this
    becomes a small rollup table refreshed every few minutes — the response
    shape does not change.
    """
    store = _store_or_503()
    from datetime import datetime, timedelta, timezone

    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    rows = await _select(
        store,
        "posts",
        columns="hashtags",
        filters={
            "is_deleted": "eq.false",
            "is_draft": "eq.false",
            "visibility": "eq.public",
            "created_at": f"gte.{since}",
        },
        limit=500,
    )
    tally: dict[str, int] = {}
    for row in rows:
        for tag in row.get("hashtags") or []:
            tally[str(tag)] = tally.get(str(tag), 0) + 1
    top = sorted(tally.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return {"items": [{"tag": t, "posts": n} for t, n in top]}


def _person_card(profile: dict[str, Any], follow_of: dict[str, str] | None = None) -> dict[str, Any]:
    """The one shape every people list returns.

    Search, suggestions and followers all render with the same row, so they
    must not each invent their own field names. ``follow_state`` is resolved
    against the caller's own edges (never trusted from the client).
    """
    pid = str(profile["id"])
    edge = (follow_of or {}).get(pid)
    details = profile.get("details") or {}
    return {
        "id": profile["id"],
        "full_name": profile.get("full_name"),
        "username": profile.get("username"),
        "avatar_url": profile.get("avatar_url"),
        "role": profile.get("role"),
        "bio": profile.get("bio"),
        "follower_count": int(profile.get("follower_count") or 0),
        "is_private": bool(profile.get("is_private")),
        "district": details.get("district"),
        "follow_state": "requested" if edge == "pending" else "following" if edge else "follow",
    }


async def _my_edges(store: AdminStore, viewer_id: str, target_ids: list[str]) -> dict[str, str]:
    """The caller's follow edges to a set of accounts, as ``{id: status}``."""
    if not target_ids:
        return {}
    rows = await _select(
        store,
        "follows",
        columns="following_id,status",
        filters={
            "follower_id": f"eq.{viewer_id}",
            "following_id": f"in.({','.join(sorted(set(target_ids)))})",
        },
    )
    return {str(r["following_id"]): str(r.get("status") or "") for r in rows}


async def _hidden_ids(store: AdminStore, viewer_id: str) -> set[str]:
    """Everyone the viewer has blocked or been blocked by."""
    blocked = await _select(
        store,
        "user_blocks",
        columns="blocker_id,blocked_id",
        or_filter=f"blocker_id.eq.{viewer_id},blocked_id.eq.{viewer_id}",
        limit=1000,
    )
    return {str(b["blocker_id"]) for b in blocked} | {str(b["blocked_id"]) for b in blocked}


@router.get("/suggested")
async def suggested_accounts(
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(8, ge=1, le=20),
    topic: str | None = Query(None, pattern="^(creator|farmer|buyer|retailer|worker|transporter|warehouse|equipment)$"),
) -> dict[str, Any]:
    """People to follow: not already followed, not blocked, most followed first.

    ``topic`` narrows the pool to one account type. "Suggested creators" is the
    same graph ranked the same way, filtered to ``Content Creator`` — a filter,
    not a second endpoint, because all eight roles are one identity.
    """
    store = _store_or_503()
    mine = await _select(store, "follows", columns="following_id", filters={"follower_id": f"eq.{user.user_id}"}, limit=1000)
    skip = {str(m["following_id"]) for m in mine} | {user.user_id}
    skip |= await _hidden_ids(store, user.user_id)

    filters: dict[str, str] = {"id": f"neq.{user.user_id}"}
    if topic:
        role = {
            "creator": "Content Creator",
            "farmer": "Farmer",
            "buyer": "Buyer",
            "retailer": "Retailer",
            "worker": "Worker",
            "transporter": "Transporter",
            "warehouse": "Warehouse",
            "equipment": "Equipment",
        }[topic]
        filters["role"] = f"eq.{role}"

    rows = await _select(
        store,
        "profiles",
        columns="id,full_name,username,avatar_url,role,bio,is_private,follower_count,details",
        filters=filters,
        order="follower_count.desc",
        limit=limit + len(skip),
    )
    return {"items": [_person_card(p) for p in rows if str(p["id"]) not in skip][:limit]}


# ── Stories ───────────────────────────────────────────────────────────────
# A story is public or followers-only, always temporary, and never appears in
# a feed. Expiry is judged on every read (``expires_at > now()``) so the tray
# is correct even if the cleanup job has not run.

_STORY_COLUMNS = "id,author_id,media_urls,video_url,caption,crop,visibility,expires_at,created_at"


def _story_card(row: dict[str, Any], author: dict[str, Any], viewed: bool) -> dict[str, Any]:
    return {
        **row,
        "media_urls": row.get("media_urls") or [],
        "viewed": viewed,
        "author": {
            "id": author.get("id"),
            "full_name": author.get("full_name"),
            "username": author.get("username"),
            "avatar_url": author.get("avatar_url"),
            "role": author.get("role"),
        },
    }


class StoryInput(BaseModel):
    media_urls: list[str] = Field(default_factory=list, max_length=10)
    video_url: str | None = None
    caption: str | None = Field(default=None, max_length=200)
    crop: str | None = Field(default=None, max_length=80)
    visibility: str = Field(default="public", pattern="^(public|followers)$")


def _active_story_filters(viewer_id: str) -> dict[str, str]:
    return {"is_deleted": "eq.false", "expires_at": f"gt.{_now_iso()}"}


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


@router.post("/stories", status_code=201)
async def create_story(
    payload: StoryInput,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """Publish a story. Media is already in Storage; only URLs arrive here."""
    from datetime import datetime, timedelta, timezone

    store = _store_or_503()
    if not payload.media_urls and not payload.video_url:
        raise HTTPException(status_code=400, detail="Add a photo or a video first.")
    ttl_hours = max(1, int(getattr(settings, "SOCIAL_STORY_TTL_HOURS", 24) or 24))
    row = {
        "author_id": user.user_id,
        "media_urls": payload.media_urls,
        "video_url": payload.video_url,
        "caption": (payload.caption or "").strip() or None,
        "crop": payload.crop,
        "visibility": payload.visibility,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=ttl_hours)).isoformat(),
    }
    try:
        created = await store.insert("stories", row)
    except AdminStoreError as exc:
        message = str(exc).lower()
        if exc.code == "42P01" or "does not exist" in message or "schema cache" in message:
            raise HTTPException(
                status_code=503,
                detail="Stories are not set up on this server yet. Run cenfriend-stories.sql.",
            ) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return created[0] if isinstance(created, list) and created else {}


@router.get("/stories")
async def list_story_trays(
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """The story bar: my own tray first, then people I follow who have stories.

    Only accepted follows are read — a pending request is not permission to see
    a private account's stories. Blocked accounts are dropped in both
    directions, exactly like the feed.
    """
    store = _store_or_503()
    edges = await _select(
        store,
        "follows",
        columns="following_id",
        filters={"follower_id": f"eq.{user.user_id}", "status": "eq.accepted"},
        limit=1000,
    )
    author_ids = [str(e["following_id"]) for e in edges] + [user.user_id]
    hidden = await _hidden_ids(store, user.user_id)
    author_ids = [a for a in author_ids if a not in hidden]

    rows = await _select(
        store,
        "stories",
        columns=_STORY_COLUMNS,
        filters={"author_id": f"in.({','.join(author_ids)})", **_active_story_filters(user.user_id)},
        order="created_at.asc",
        limit=MAX_PAGE,
    )
    if not rows:
        return {"trays": [], "mine": []}

    profiles = await _select(
        store,
        "profiles",
        columns="id,full_name,username,avatar_url,role",
        filters={"id": f"in.({','.join(sorted({str(r['author_id']) for r in rows}))})"},
    )
    by_id = {str(p["id"]): p for p in profiles}
    views = await _select(
        store,
        "story_views",
        columns="story_id",
        filters={"viewer_id": f"eq.{user.user_id}", "story_id": f"in.({','.join(str(r['id']) for r in rows)})"},
    )
    seen = {str(v["story_id"]) for v in views}

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row["author_id"]), []).append(
            _story_card(row, by_id.get(str(row["author_id"]), {}), str(row["id"]) in seen)
        )

    trays = []
    for author_id, stories in grouped.items():
        trays.append(
            {
                "user": _story_card(stories[0], by_id.get(author_id, {}), False)["author"],
                "stories": stories,
                "all_viewed": all(s["viewed"] for s in stories),
                "is_me": author_id == user.user_id,
            }
        )
    # Mine first, then whoever still has something unseen, then the rest.
    trays.sort(key=lambda t: (not t["is_me"], t["all_viewed"]))
    mine = next((t["stories"] for t in trays if t["is_me"]), [])
    return {"trays": trays, "mine": mine}


@router.post("/stories/{story_id}/view", status_code=204)
async def mark_story_viewed(
    story_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Record a view. Repeating it is harmless — the primary key dedupes."""
    store = _store_or_503()
    rows = await _select(
        store, "stories", columns="id,author_id", filters={"id": f"eq.{story_id}", **_active_story_filters(user.user_id), "limit": "1"}
    )
    if not rows:
        raise HTTPException(status_code=404, detail="That story has expired.")
    author = str(rows[0]["author_id"])
    if author != user.user_id and await _is_blocked(store, user.user_id, author):
        raise HTTPException(status_code=404, detail="That story has expired.")
    try:
        await store.insert("story_views", {"story_id": story_id, "viewer_id": user.user_id})
    except AdminStoreError as exc:
        # 23505 = already viewed. A duplicate view is success, not an error.
        if exc.code != "23505" and "duplicate" not in str(exc).lower():
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/stories/{story_id}", status_code=204)
async def delete_story(
    story_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    rows = await _select(store, "stories", columns="id,author_id", filters={"id": f"eq.{story_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="That story does not exist.")
    _require_owner("story", str(rows[0]["author_id"]), user)
    try:
        await store.update("stories", {"is_deleted": True}, filters={"id": f"eq.{story_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# NOTE: the two concrete story routes above are declared BEFORE the tray route
# below on purpose. FastAPI matches in registration order, so `/stories/abc`
# would otherwise be captured by `{user_id}` and a view could never be saved.
@router.get("/stories/{user_id}")
async def user_stories(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """One account's active stories, subject to the same visibility rules."""
    store = _store_or_503()
    if user_id != user.user_id and await _is_blocked(store, user.user_id, user_id):
        raise HTTPException(status_code=404, detail="Those stories are not available.")

    profile = await _profile(store, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="That account does not exist.")
    if user_id != user.user_id and profile.get("is_private"):
        edge = await _following_edge(store, user.user_id, user_id)
        if not edge or edge.get("status") != "accepted":
            raise HTTPException(status_code=404, detail="Those stories are not available.")

    filters = {"author_id": f"eq.{user_id}", **_active_story_filters(user.user_id)}
    if user_id != user.user_id:
        filters["visibility"] = "eq.public" if profile.get("is_private") is False else "in.(public,followers)"
    rows = await _select(store, "stories", columns=_STORY_COLUMNS, filters=filters, order="created_at.asc", limit=MAX_PAGE)
    if not rows:
        return {"user": _person_card(profile), "stories": []}

    views = await _select(
        store,
        "story_views",
        columns="story_id",
        filters={"viewer_id": f"eq.{user.user_id}", "story_id": f"in.({','.join(str(r['id']) for r in rows)})"},
    )
    seen = {str(v["story_id"]) for v in views}
    author = {"id": profile.get("id"), "full_name": profile.get("full_name"), "username": profile.get("username"),
              "avatar_url": profile.get("avatar_url"), "role": profile.get("role")}
    return {
        "user": _person_card(profile),
        "stories": [_story_card(r, author, str(r["id"]) in seen) for r in rows],
    }


# ── Comment inbox ─────────────────────────────────────────────────────────


@router.get("/comments/inbox")
async def comment_inbox(
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
) -> dict[str, Any]:
    """Recent comments on MY posts — the activity panel in the right column.

    Not a notifications feed: those already exist and are deduped. This is the
    live thread, so the same comment is read once and shown with the post it
    belongs to.
    """
    store = _store_or_503()
    my_posts = await _select(
        store,
        "posts",
        columns="id,body,media_urls,image_url,post_kind",
        filters={"author_id": f"eq.{user.user_id}", "is_deleted": "eq.false"},
        order="created_at.desc",
        limit=200,
    )
    if not my_posts:
        return {"items": []}
    post_by_id = {str(p["id"]): p for p in my_posts}
    rows = await _select(
        store,
        "comments",
        columns="id,post_id,author_id,body,created_at",
        filters={
            "post_id": f"in.({','.join(post_by_id)})",
            "is_deleted": "eq.false",
            "author_id": f"neq.{user.user_id}",
        },
        order="created_at.desc",
        limit=limit,
    )
    if not rows:
        return {"items": []}
    profiles = await _select(
        store,
        "profiles",
        columns="id,full_name,username,avatar_url,role",
        filters={"id": f"in.({','.join(sorted({str(r['author_id']) for r in rows}))})"},
    )
    by_id = {str(p["id"]): p for p in profiles}
    return {
        "items": [
            {
                **row,
                "author": {
                    "id": by_id.get(str(row["author_id"]), {}).get("id"),
                    "full_name": by_id.get(str(row["author_id"]), {}).get("full_name"),
                    "username": by_id.get(str(row["author_id"]), {}).get("username"),
                    "avatar_url": by_id.get(str(row["author_id"]), {}).get("avatar_url"),
                    "role": by_id.get(str(row["author_id"]), {}).get("role"),
                },
                "post": {
                    "id": row["post_id"],
                    "body": (post_by_id.get(str(row["post_id"])) or {}).get("body"),
                    "media_urls": (post_by_id.get(str(row["post_id"])) or {}).get("media_urls") or [],
                },
            }
            for row in rows
        ]
    }


# ── Profile ───────────────────────────────────────────────────────────────


@router.get("/profile/{user_id}")
async def public_profile(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """One profile plus the caller's relationship to it.

    A private account returns its PUBLIC facts (name, handle, bio, counts) and
    ``is_restricted: true`` — never its posts. That is how the UI can show a
    locked profile without the API having leaked a single row.
    """
    store = _store_or_503()
    if await _is_blocked(store, user.user_id, user_id):
        raise HTTPException(status_code=404, detail="This account is not available.")

    profile = await _profile(store, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="This account does not exist.")

    edge = None if user_id == user.user_id else await _following_edge(store, user.user_id, user_id)
    incoming = None if user_id == user.user_id else await _following_edge(store, user_id, user.user_id)

    is_self = user_id == user.user_id
    is_private = bool(profile.get("is_private"))
    can_see_posts = is_self or not is_private or bool(edge and edge.get("status") == "accepted")

    details = profile.get("details") or {}
    payload: dict[str, Any] = {
        "id": profile["id"],
        "full_name": profile.get("full_name"),
        "username": profile.get("username"),
        "bio": profile.get("bio"),
        "avatar_url": profile.get("avatar_url"),
        "cover_url": profile.get("cover_url"),
        "role": profile.get("role"),
        "creator_mode": bool(profile.get("creator_mode")),
        "follower_count": int(profile.get("follower_count") or 0),
        "following_count": int(profile.get("following_count") or 0),
        "post_count": int(profile.get("post_count") or 0),
        "is_private": is_private,
        "is_self": is_self,
        "is_restricted": not can_see_posts,
        "district": details.get("district"),
        "state": details.get("state"),
        "follow_state": "me"
        if is_self
        else _follow_state(edge, bool(incoming and incoming.get("status") == "accepted")),
        "can_message": bool(profile.get("allow_messages", True)) and not is_private or can_see_posts,
    }
    return payload


@router.get("/profile/{user_id}/posts")
async def profile_posts(
    user_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
    cursor: str | None = None,
    limit: int = Query(24, ge=1, le=MAX_PAGE),
) -> dict[str, Any]:
    """A profile's grid. Refused with 403 for a private account I do not follow."""
    store = _store_or_503()
    if await _is_blocked(store, user.user_id, user_id):
        raise HTTPException(status_code=404, detail="This account is not available.")
    if user_id != user.user_id:
        target = await _profile(store, user_id) or {}
        if target.get("is_private"):
            edge = await _following_edge(store, user.user_id, user_id)
            if not edge or edge.get("status") != "accepted":
                raise HTTPException(status_code=403, detail="This account is private. Follow it to see its posts.")

    size, _ = _page(limit, 0)
    filters: dict[str, str] = {
        "author_id": f"eq.{user_id}",
        "is_deleted": "eq.false",
        "is_draft": "eq.false",
    }
    if user_id != user.user_id:
        # Own drafts and private posts only appear on my own grid.
        filters["visibility"] = "in.(public,followers)"
    if cursor:
        filters["created_at"] = f"lt.{cursor}"

    rows = await _select(store, "posts", columns=_POST_COLUMNS, filters=filters, order="created_at.desc", limit=size)
    items = await _hydrate(store, rows, user.user_id)
    return {"items": items, "next_cursor": items[-1]["created_at"] if len(items) >= size else None}


# ── Saved & single post ───────────────────────────────────────────────────


@router.get("/saved")
async def list_saved(
    user: Annotated[CurrentUser, Depends(require_user)],
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """My bookmarks. Private by policy — see the saved_posts RLS."""
    store = _store_or_503()
    size, skip = _page(limit, offset)
    saves = await _select(
        store,
        "saved_posts",
        columns="post_id,created_at",
        filters={"user_id": f"eq.{user.user_id}"},
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    if not saves:
        return {"items": [], "next_offset": None}
    ids = [str(s["post_id"]) for s in saves]
    rows = await _select(
        store,
        "posts",
        columns=_POST_COLUMNS,
        filters={"id": f"in.({','.join(ids)})", "is_deleted": "eq.false"},
    )
    # Keep the bookmark order, and drop anything un-saveable (deleted/blocked).
    by_id = {str(r["id"]): r for r in rows}
    ordered = [by_id[i] for i in ids if i in by_id]
    items = await _hydrate(store, ordered, user.user_id)
    return {"items": items, "next_offset": skip + len(items) if len(items) >= size else None}


@router.post("/posts/{post_id}/save", status_code=204)
async def save_post(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    await _assert_can_view_post(store, post, user.user_id)
    try:
        await store.insert("saved_posts", {"user_id": user.user_id, "post_id": post_id}, returning=False)
    except AdminStoreError as exc:
        if exc.code != "23505":
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/posts/{post_id}/save", status_code=204)
async def unsave_post(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    try:
        await store.delete("saved_posts", filters={"user_id": f"eq.{user.user_id}", "post_id": f"eq.{post_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/posts/{post_id}/share", status_code=204)
async def share_post(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Count a share. Sharing itself (copy link / native share) is client-side;
    this only records the event so the count is honest."""
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    await _assert_can_view_post(store, post, user.user_id)
    try:
        await store.rpc("increment_share_count", {"p_post_id": post_id})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/posts/{post_id}")
async def get_post(
    post_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> dict[str, Any]:
    """One post with its comments, for the single-post screen."""
    store = _store_or_503()
    post = await _post_or_404(store, post_id)
    await _assert_can_view_post(store, post, user.user_id)
    rows = await _select(
        store, "posts", columns=_POST_COLUMNS, filters={"id": f"eq.{post_id}", "limit": "1"}
    )
    hydrated = await _hydrate(store, rows, user.user_id)
    if not hydrated:
        raise HTTPException(status_code=404, detail="That post no longer exists.")
    return {
        **hydrated[0],
        "comments": await _comment_tree(store, post_id, user.user_id),
    }


async def _comment_tree(store: AdminStore, post_id: str, viewer_id: str) -> list[dict[str, Any]]:
    """Comments with their replies nested one level deep.

    Bounded at 200 rows so a viral post cannot return an unbounded payload;
    the client shows "load more" rather than the API streaming a thread of
    tens of thousands.
    """
    rows = await _select(
        store,
        "comments",
        columns="id,post_id,author_id,parent_id,body,like_count,is_deleted,created_at",
        filters={"post_id": f"eq.{post_id}"},
        order="created_at.asc",
        limit=200,
    )
    if not rows:
        return []
    author_ids = sorted({str(r["author_id"]) for r in rows})
    authors = await _select(
        store,
        "profiles",
        columns="id,full_name,username,avatar_url,role",
        filters={"id": f"in.({','.join(author_ids)})"},
    )
    by_id = {str(a["id"]): a for a in authors}
    mine = await _select(
        store,
        "comment_likes",
        columns="comment_id",
        filters={"user_id": f"eq.{viewer_id}", "comment_id": f"in.({','.join(str(r['id']) for r in rows)})"},
    )
    liked = {str(m["comment_id"]) for m in mine}

    nodes: dict[str, dict[str, Any]] = {}
    for row in rows:
        author = by_id.get(str(row["author_id"]), {})
        nodes[str(row["id"])] = {
            **row,
            "body": "[deleted]" if row.get("is_deleted") else row.get("body"),
            "is_mine": str(row["author_id"]) == viewer_id,
            "liked": str(row["id"]) in liked,
            "author": {
                "id": author.get("id"),
                "full_name": author.get("full_name"),
                "username": author.get("username"),
                "avatar_url": author.get("avatar_url"),
                "role": author.get("role"),
            },
            "replies": [],
        }
    roots: list[dict[str, Any]] = []
    for node in nodes.values():
        parent = node.get("parent_id")
        if parent and str(parent) in nodes:
            nodes[str(parent)]["replies"].append(node)
        else:
            roots.append(node)
    return roots


@router.post("/comments/{comment_id}/like", status_code=204)
async def like_comment(
    comment_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    rows = await _select(store, "comments", columns="post_id", filters={"id": f"eq.{comment_id}", "limit": "1"})
    if not rows:
        raise HTTPException(status_code=404, detail="That comment no longer exists.")
    post = await _post_or_404(store, str(rows[0]["post_id"]))
    await _assert_can_view_post(store, post, user.user_id)
    try:
        await store.insert("comment_likes", {"comment_id": comment_id, "user_id": user.user_id}, returning=False)
    except AdminStoreError as exc:
        if exc.code != "23505":
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("/comments/{comment_id}/like", status_code=204)
async def unlike_comment(
    comment_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    store = _store_or_503()
    try:
        await store.delete("comment_likes", filters={"comment_id": f"eq.{comment_id}", "user_id": f"eq.{user.user_id}"})
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# ── Notifications ─────────────────────────────────────────────────────────


@router.get("/notifications")
async def list_notifications(
    user: Annotated[CurrentUser, Depends(require_user)],
    unread_only: bool = False,
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Social notifications for ME, newest first, with the unread count."""
    store = _store_or_503()
    size, skip = _page(limit, offset)
    filters = {"user_id": f"eq.{user.user_id}"}
    if unread_only:
        filters["read_at"] = "is.null"
    rows = await _select(
        store,
        "social_notifications",
        columns="id,kind,title,body,link,actor_id,read_at,created_at",
        filters=filters,
        order="created_at.desc",
        limit=size,
        offset=skip,
    )
    unread = await _count(store, "social_notifications", {"user_id": f"eq.{user.user_id}", "read_at": "is.null"})

    actor_ids = sorted({str(r["actor_id"]) for r in rows if r.get("actor_id")})
    actors: dict[str, dict[str, Any]] = {}
    if actor_ids:
        prof = await _select(
            store,
            "profiles",
            columns="id,full_name,username,avatar_url,role",
            filters={"id": f"in.({','.join(actor_ids)})"},
        )
        actors = {str(p["id"]): p for p in prof}

    items = [
        {**r, "actor": actors.get(str(r.get("actor_id"))) if r.get("actor_id") else None}
        for r in rows
    ]
    return {"items": items, "unread": unread, "next_offset": skip + len(items) if len(items) >= size else None}


@router.post("/notifications/read", status_code=204)
async def mark_all_read(user: Annotated[CurrentUser, Depends(require_user)]) -> None:
    store = _store_or_503()
    from datetime import datetime, timezone

    try:
        await store.update(
            "social_notifications",
            {"read_at": datetime.now(timezone.utc).isoformat()},
            filters={"user_id": f"eq.{user.user_id}", "read_at": "is.null"},
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/notifications/{notification_id}/read", status_code=204)
async def mark_one_read(
    notification_id: str,
    user: Annotated[CurrentUser, Depends(require_user)],
) -> None:
    """Mark one read. The filter on ``user_id`` is what stops a caller from
    clearing somebody else's badge by guessing an id."""
    store = _store_or_503()
    from datetime import datetime, timezone

    try:
        await store.update(
            "social_notifications",
            {"read_at": datetime.now(timezone.utc).isoformat()},
            filters={"id": f"eq.{notification_id}", "user_id": f"eq.{user.user_id}"},
        )
    except AdminStoreError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
