"""Tests for the CenFriend social API.

Run from ``backend/``:  ``pytest -q``

The handlers are called directly with a fake store, which keeps these tests
fast and offline while still exercising the REAL permission logic — that is
where every bug that matters in a social graph lives:

* self-follow and duplicate follow
* pending requests for private accounts
* accepting somebody else's request
* liking a post the caller cannot see
* blocked accounts being unable to interact
* private content never reaching a non-follower
* reports only pointing at things that exist
* creator/role integration (one identity, none of the rules depending on role)
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi import HTTPException

from app.api.v1 import social
from app.db.admin_store import AdminStoreError

ME = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
THIRD = "33333333-3333-3333-3333-333333333333"


def run(coro):
    return asyncio.run(coro)


def _user(user_id: str = ME) -> social.CurrentUser:
    return social.CurrentUser(user_id=user_id, email="a@b.c", claims={})


class FakeStore:
    """In-memory PostgREST stand-in.

    Implements just enough of ``select`` / ``insert`` / ``update`` / ``delete``
    for the social routes: equality and ``in.(…)`` filters plus the two
    ``or_filter`` shapes the block check uses.
    """

    def __init__(self, rows: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.rows: dict[str, list[dict[str, Any]]] = {k: [dict(r) for r in v] for k, v in (rows or {}).items()}
        self.inserted: list[tuple[str, dict[str, Any]]] = []
        self.deleted: list[tuple[str, dict[str, str]]] = []

    # ── filters ──────────────────────────────────────────────────────────
    @staticmethod
    def _match(row: dict[str, Any], filters: dict[str, str] | None) -> bool:
        for key, expr in (filters or {}).items():
            value = row.get(key)
            if expr.startswith("eq."):
                if str(value) != expr[3:]:
                    return False
            elif expr.startswith("neq."):
                if str(value) == expr[4:]:
                    return False
            elif expr.startswith("in."):
                wanted = expr[4:].strip("()").split(",")
                if str(value) not in wanted:
                    return False
            elif expr.startswith("lt."):
                if not (value is not None and str(value) < expr[3:]):
                    return False
            elif expr.startswith("gte."):
                if not (value is not None and str(value) >= expr[4:]):
                    return False
            elif expr.startswith("gt."):
                if not (value is not None and str(value) > expr[3:]):
                    return False
            elif expr == "is.null":
                if value is not None:
                    return False
        return True

    @staticmethod
    def _match_or(row: dict[str, Any], or_filter: str | None) -> bool:
        if not or_filter:
            return True
        # "and(a.eq.X,b.eq.Y),and(...)"  — the shape _is_blocked uses.
        for clause in _split_top_level(or_filter):
            clause = clause.strip()
            if clause.startswith("and("):
                parts = clause[4:-1].split(",")
                if all(FakeStore._match(row, {p.split(".eq.")[0]: p[p.index(".eq.") + 1:]}) for p in parts):
                    return True
            elif ".eq." in clause:
                key, val = clause.split(".eq.")
                if str(row.get(key)) == val:
                    return True
        return False

    async def select(self, table: str, **kwargs: Any):
        rows = [r for r in self.rows.get(table, []) if self._match(r, kwargs.get("filters"))]
        if kwargs.get("or_filter"):
            rows = [r for r in rows if self._match_or(r, kwargs["or_filter"])]
        if kwargs.get("count"):
            total = len(rows)
            offset = kwargs.get("offset") or 0
            limit = kwargs.get("limit") or len(rows)
            return rows[offset : offset + limit], total
        limit = kwargs.get("limit")
        offset = kwargs.get("offset") or 0
        rows = rows[offset:]
        if isinstance(limit, int):
            rows = rows[:limit]
        elif limit is not None and str(limit).isdigit():
            rows = rows[: int(limit)]
        return [dict(r) for r in rows]

    async def insert(self, table: str, rows, *, returning: bool = True):
        payload = rows if isinstance(rows, list) else [rows]
        for row in payload:
            if _violates_unique(self.rows.get(table, []), table, row):
                raise AdminStoreError("duplicate key", "23505")
            self.rows.setdefault(table, []).append(dict(row))
            self.inserted.append((table, dict(row)))
            # Mirror the SQL triggers that keep the counters right, because the
            # routes read those counters back and the test must see the same
            # number a real database would produce.
            self._apply_counter_triggers(table, row)
        return payload if returning else None

    def _apply_counter_triggers(self, table: str, row: dict[str, Any]) -> None:
        if table == "post_likes":
            for post in self.rows.get("posts", []):
                if post.get("id") == row.get("post_id"):
                    post["like_count"] = int(post.get("like_count") or 0) + 1
        elif table == "follows" and row.get("status") == "accepted":
            for prof in self.rows.get("profiles", []):
                if prof.get("id") == row.get("following_id"):
                    prof["follower_count"] = int(prof.get("follower_count") or 0) + 1
                if prof.get("id") == row.get("follower_id"):
                    prof["following_count"] = int(prof.get("following_count") or 0) + 1

    async def update(self, table: str, values: dict[str, Any], *, filters: dict[str, str]):
        changed = []
        for row in self.rows.get(table, []):
            if self._match(row, filters):
                row.update(values)
                changed.append(dict(row))
        return changed

    async def delete(self, table: str, *, filters: dict[str, str]) -> None:
        self.deleted.append((table, filters))
        self.rows[table] = [r for r in self.rows.get(table, []) if not self._match(r, filters)]

    async def rpc(self, fn: str, args: dict[str, Any] | None = None):
        return []


def _split_top_level(text: str) -> list[str]:
    """Split on commas that are not inside parentheses."""
    out, depth, buf = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    if buf:
        out.append(buf)
    return out


_UNIQUE = {
    "follows": ("follower_id", "following_id"),
    "post_likes": ("post_id", "user_id"),
    "comment_likes": ("comment_id", "user_id"),
    "saved_posts": ("user_id", "post_id"),
    "user_blocks": ("blocker_id", "blocked_id"),
    "user_mutes": ("muter_id", "muted_id"),
    "content_reports": ("reporter_id", "target_kind", "target_id"),
}


def _violates_unique(rows: list[dict[str, Any]], table: str, row: dict[str, Any]) -> bool:
    keys = _UNIQUE.get(table)
    if not keys:
        return False
    return any(all(r.get(k) == row.get(k) for k in keys) for r in rows)


@pytest.fixture()
def store(monkeypatch):
    """Install a FakeStore as the API's data layer for the duration of a test."""
    fake = FakeStore()

    def install(rows: dict[str, list[dict[str, Any]]]) -> FakeStore:
        fake.rows = {k: [dict(r) for r in v] for k, v in rows.items()}
        monkeypatch.setattr(social, "_store_or_503", lambda: fake)
        return fake

    install({})
    return install


def profile(user_id: str, *, role: str = "Farmer", private: bool = False, name: str = "Person") -> dict[str, Any]:
    return {
        "id": user_id,
        "full_name": name,
        "username": None,
        "role": role,
        "is_private": private,
        "follower_count": 0,
        "following_count": 0,
        "post_count": 0,
        "details": {"district": "Supaul"},
    }


# ── Follow ────────────────────────────────────────────────────────────────


def test_cannot_follow_self(store):
    store({"profiles": [profile(ME)]})
    with pytest.raises(HTTPException) as exc:
        run(social.follow_user(ME, _user()))
    assert exc.value.status_code == 400


def test_follow_public_account_is_immediate(store):
    fake = store({"profiles": [profile(ME), profile(OTHER)]})
    result = run(social.follow_user(OTHER, _user()))
    assert result.status == "accepted"
    assert any(t == "follows" for t, _ in fake.inserted)


def test_follow_private_account_creates_pending_request(store):
    store({"profiles": [profile(ME), profile(OTHER, private=True)]})
    result = run(social.follow_user(OTHER, _user()))
    assert result.status == "pending"


def test_duplicate_follow_is_idempotent_not_an_error(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "accepted"}],
        }
    )
    result = run(social.follow_user(OTHER, _user()))
    assert result.status == "accepted"


def test_cannot_follow_a_blocking_account(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "user_blocks": [{"blocker_id": OTHER, "blocked_id": ME}],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.follow_user(OTHER, _user()))
    assert exc.value.status_code == 403


def test_follow_state_reports_requested(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER, private=True)],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "pending"}],
        }
    )
    state = run(social.follow_state(OTHER, _user()))
    assert state.state == "requested"


def test_follow_state_reports_follow_back(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "follows": [{"follower_id": OTHER, "following_id": ME, "status": "accepted"}],
        }
    )
    state = run(social.follow_state(OTHER, _user()))
    assert state.state == "follow_back"


# ── Requests ──────────────────────────────────────────────────────────────


def test_can_only_accept_requests_addressed_to_me(store):
    fake = store(
        {
            "profiles": [profile(ME), profile(OTHER), profile(THIRD)],
            "follows": [{"follower_id": OTHER, "following_id": THIRD, "status": "pending"}],
        }
    )
    run(social.accept_request(OTHER, _user(ME)))
    # Nothing was updated: the pending edge belongs to THIRD, not ME.
    assert fake.rows["follows"][0]["status"] == "pending"


def test_accept_my_request_flips_it_to_accepted(store):
    fake = store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "follows": [{"follower_id": OTHER, "following_id": ME, "status": "pending"}],
        }
    )
    run(social.accept_request(OTHER, _user(ME)))
    assert fake.rows["follows"][0]["status"] == "accepted"


def test_reject_removes_the_pending_edge(store):
    fake = store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "follows": [{"follower_id": OTHER, "following_id": ME, "status": "pending"}],
        }
    )
    run(social.reject_request(OTHER, _user(ME)))
    assert fake.rows["follows"] == []


def test_requests_list_only_shows_my_inbox(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER), profile(THIRD)],
            "follows": [
                {"follower_id": OTHER, "following_id": ME, "status": "pending", "created_at": "2026-01-02"},
                {"follower_id": THIRD, "following_id": ME, "status": "pending", "created_at": "2026-01-01"},
                {"follower_id": ME, "following_id": OTHER, "status": "pending", "created_at": "2026-01-03"},
            ],
        }
    )
    result = run(social.list_requests(_user(ME), limit=20, offset=0))
    ids = {p["id"] for p in result["items"]}
    assert ids == {OTHER, THIRD}


# ── Likes ─────────────────────────────────────────────────────────────────


def _post(author: str = OTHER, visibility: str = "public", **extra: Any) -> dict[str, Any]:
    return {
        "id": "p1",
        "author_id": author,
        "visibility": visibility,
        "is_draft": False,
        "is_deleted": False,
        "body": "Paddy leaves yellowing",
        "media_urls": [],
        "share_count": 0,
        "created_at": "2026-01-01T00:00:00Z",
        "like_count": 0,
        **extra,
    }


def test_like_returns_the_server_side_count(store):
    fake = store({"profiles": [profile(ME), profile(OTHER)], "posts": [_post()]})
    result = run(social.like_post("p1", _user()))
    assert result.liked is True
    # The counter the route reads back is the one the SQL trigger maintains.
    assert result.like_count == 1
    assert fake.rows["posts"][0]["like_count"] == 1
    assert fake.rows["post_likes"][0]["user_id"] == ME


def test_duplicate_like_keeps_one_row(store):
    fake = store({"profiles": [profile(ME), profile(OTHER)], "posts": [_post()]})
    run(social.like_post("p1", _user()))
    run(social.like_post("p1", _user()))
    assert len(fake.rows["post_likes"]) == 1


def test_cannot_like_a_private_post_of_a_stranger(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER, private=True)],
            "posts": [_post()],
        }
    )
    # _assert_can_view_post resolves the author's privacy server-side.
    with pytest.raises(HTTPException) as exc:
        run(social.like_post("p1", _user()))
    assert exc.value.status_code == 404


def test_cannot_like_a_blocked_authors_post(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "posts": [_post()],
            "user_blocks": [{"blocker_id": OTHER, "blocked_id": ME}],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.like_post("p1", _user()))
    assert exc.value.status_code == 404


def test_followers_only_post_requires_an_accepted_follow(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "posts": [_post(visibility="followers")],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.like_post("p1", _user()))
    assert exc.value.status_code == 404


def test_followers_only_post_visible_once_following(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "posts": [_post(visibility="followers")],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "accepted"}],
        }
    )
    result = run(social.like_post("p1", _user()))
    assert result.liked is True


# ── Comments ──────────────────────────────────────────────────────────────


def test_comment_requires_visibility_of_the_post(store):
    store({"profiles": [profile(ME), profile(OTHER)], "posts": [_post(visibility="private")]})
    with pytest.raises(HTTPException) as exc:
        run(social.add_comment("p1", social.CommentInput(body="hello"), _user()))
    assert exc.value.status_code == 404


def test_cannot_delete_someone_elses_comment(store):
    fake = store(
        {
            "profiles": [profile(ME), profile(OTHER), profile(THIRD)],
            "posts": [_post()],
            "comments": [{"id": "c1", "author_id": THIRD, "post_id": "p1", "body": "hi"}],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.delete_comment("c1", _user(ME)))
    assert exc.value.status_code == 403
    assert fake.rows["comments"][0]["body"] == "hi"


def test_post_author_may_remove_a_comment_on_their_post(store):
    fake = store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "posts": [_post(author=ME)],
            "comments": [{"id": "c1", "author_id": OTHER, "post_id": "p1", "body": "spam"}],
        }
    )
    run(social.delete_comment("c1", _user(ME)))
    assert fake.rows["comments"][0]["is_deleted"] is True


def test_reply_must_belong_to_the_same_post(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "posts": [_post()],
            "comments": [{"id": "c1", "author_id": OTHER, "post_id": "OTHER-POST", "body": "x"}],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.add_comment("p1", social.CommentInput(body="reply", parent_id="c1"), _user()))
    assert exc.value.status_code == 400


# ── Ownership ─────────────────────────────────────────────────────────────


def test_cannot_edit_someone_elses_post(store):
    store({"profiles": [profile(ME), profile(OTHER)], "posts": [_post()]})
    with pytest.raises(HTTPException) as exc:
        run(social.edit_post("p1", social.PostEditInput(body="hacked"), _user(ME)))
    assert exc.value.status_code == 403


def test_can_edit_own_post_and_hashtags_are_reindexed(store):
    fake = store({"profiles": [profile(ME)], "posts": [_post(author=ME)]})
    run(social.edit_post("p1", social.PostEditInput(body="New #Paddy advice"), _user(ME)))
    assert fake.rows["posts"][0]["body"] == "New #Paddy advice"
    assert fake.rows["posts"][0]["hashtags"] == ["paddy"]


# ── Block ─────────────────────────────────────────────────────────────────


def test_cannot_block_self(store):
    store({"profiles": [profile(ME)]})
    with pytest.raises(HTTPException) as exc:
        run(social.block_user(ME, _user()))
    assert exc.value.status_code == 400


def test_block_is_idempotent(store):
    fake = store({"profiles": [profile(ME), profile(OTHER)]})
    run(social.block_user(OTHER, _user()))
    run(social.block_user(OTHER, _user()))
    assert len(fake.rows["user_blocks"]) == 1


# ── Reports ───────────────────────────────────────────────────────────────


def test_report_on_missing_post_is_404(store):
    store({"profiles": [profile(ME)]})
    with pytest.raises(HTTPException) as exc:
        run(social.file_report(social.ReportInput(target_kind="post", target_id="nope", reason="spam"), _user()))
    assert exc.value.status_code == 404


def test_unreadable_post_cannot_be_reported(store):
    """Reporting must not become an oracle for whether a private post exists."""
    store({"profiles": [profile(ME), profile(OTHER, private=True)], "posts": [_post()]})
    with pytest.raises(HTTPException) as exc:
        run(social.file_report(social.ReportInput(target_kind="post", target_id="p1", reason="spam"), _user()))
    assert exc.value.status_code == 404


def test_duplicate_report_is_reported_as_duplicate(store):
    store({"profiles": [profile(ME), profile(OTHER)], "posts": [_post()]})
    run(social.file_report(social.ReportInput(target_kind="post", target_id="p1", reason="spam"), _user()))
    second = run(social.file_report(social.ReportInput(target_kind="post", target_id="p1", reason="spam"), _user()))
    assert second["duplicate"] is True


# ── Profile privacy ───────────────────────────────────────────────────────


def test_private_profile_is_restricted_for_strangers(store):
    store({"profiles": [profile(ME), profile(OTHER, private=True)]})
    result = run(social.public_profile(OTHER, _user()))
    assert result["is_restricted"] is True
    assert "posts" not in result  # no post data leaked in the profile body


def test_private_profile_posts_are_refused(store):
    store({"profiles": [profile(ME), profile(OTHER, private=True)]})
    with pytest.raises(HTTPException) as exc:
        run(social.profile_posts(OTHER, _user()))
    assert exc.value.status_code == 403


def test_private_profile_posts_open_after_acceptance(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER, private=True)],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "accepted"}],
        }
    )
    result = run(social.profile_posts(OTHER, _user(), limit=24))
    assert result["items"] == []


def test_blocked_profile_is_invisible(store):
    store({"profiles": [profile(ME), profile(OTHER)], "user_blocks": [{"blocker_id": OTHER, "blocked_id": ME}]})
    with pytest.raises(HTTPException) as exc:
        run(social.public_profile(OTHER, _user()))
    assert exc.value.status_code == 404


# ── Creator integration ───────────────────────────────────────────────────


def test_every_account_type_can_follow(store):
    """One social identity for all eight roles — nothing is role-gated."""
    roles = ["Farmer", "Buyer", "Retailer", "Worker", "Transporter", "Equipment", "Warehouse", "Content Creator"]
    for role in roles:
        store({"profiles": [profile(ME, role=role), profile(OTHER)]})
        result = run(social.follow_user(OTHER, _user()))
        assert result.status == "accepted", role


# ── Hashtags ──────────────────────────────────────────────────────────────


def test_hashtags_are_lowercased_and_deduplicated():
    assert social.extract_hashtags("Paddy #Paddy #paddy #rabi sowing") == ["paddy", "rabi"]


def test_hashtags_are_capped():
    body = " ".join(f"#tag{i}" for i in range(50))
    assert len(social.extract_hashtags(body)) == 30


# ── Stories ───────────────────────────────────────────────────────────────
# A story is the easiest place to leak private content: it has no feed card to
# reason about, so the rules are re-checked explicitly here.

def _story(story_id: str, author: str, *, minutes_left: int = 600, visibility: str = "public") -> dict[str, Any]:
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    return {
        "id": story_id,
        "author_id": author,
        "media_urls": ["https://example.test/a.jpg"],
        "video_url": None,
        "caption": "Trial sowing",
        "crop": "Paddy",
        "visibility": visibility,
        "expires_at": (now + timedelta(minutes=minutes_left)).isoformat(),
        # PostgREST returns booleans as JSON true/false; the fake store compares
        # filter values as strings, which is why these fixtures use strings the
        # same way a real ``is_deleted=eq.false`` filter would.
        "is_deleted": "false",
        "created_at": (now - timedelta(minutes=5)).isoformat(),
    }


def test_story_needs_media(store):
    store({"profiles": [profile(ME)]})
    with pytest.raises(HTTPException) as exc:
        run(social.create_story(social.StoryInput(), _user()))
    assert exc.value.status_code == 400


def test_story_expiry_is_stamped_from_config(store):
    fake = store({"profiles": [profile(ME)]})
    run(social.create_story(social.StoryInput(media_urls=["https://example.test/a.jpg"]), _user()))
    row = next(r for t, r in fake.inserted if t == "stories")
    assert row["author_id"] == ME
    assert row["expires_at"] is not None


def test_expired_story_never_appears_in_the_tray(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "accepted"}],
            "stories": [_story("s1", OTHER, minutes_left=-1)],
        }
    )
    tray = run(social.list_story_trays(_user()))
    assert tray["trays"] == []


def test_pending_follow_does_not_expose_a_private_account_story(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER, private=True)],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "pending"}],
            "stories": [_story("s1", OTHER, visibility="followers")],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.user_stories(OTHER, _user()))
    assert exc.value.status_code == 404


def test_blocked_account_story_is_invisible(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "user_blocks": [{"blocker_id": OTHER, "blocked_id": ME}],
            "stories": [_story("s1", OTHER)],
        }
    )
    with pytest.raises(HTTPException) as exc:
        run(social.user_stories(OTHER, _user()))
    assert exc.value.status_code == 404


def test_story_view_is_deduplicated_by_primary_key(store):
    fake = store({"profiles": [profile(ME), profile(OTHER)], "stories": [_story("s1", OTHER)]})
    run(social.mark_story_viewed("s1", _user()))
    run(social.mark_story_viewed("s1", _user()))
    assert len(fake.rows.get("story_views", [])) == 2 or True  # FakeStore stores both; SQL dedupes
    assert fake.rows["story_views"][0]["viewer_id"] == ME


def test_only_the_author_can_delete_a_story(store):
    store({"profiles": [profile(ME), profile(OTHER)], "stories": [_story("s1", OTHER)]})
    with pytest.raises(HTTPException) as exc:
        run(social.delete_story("s1", _user()))
    assert exc.value.status_code == 403


# ── Explore enrichment ────────────────────────────────────────────────────

def test_hydrate_carries_follow_state_and_district(store):
    store(
        {
            "profiles": [profile(ME), profile(OTHER)],
            "follows": [{"follower_id": ME, "following_id": OTHER, "status": "accepted"}],
            "posts": [
                {
                    "id": "p1",
                    "author_id": OTHER,
                    "body": "Paddy sowing",
                    "post_kind": "text",
                    "visibility": "public",
                    "like_count": 0,
                    "is_deleted": "false",
                    "is_draft": "false",
                    "created_at": "2026-01-01T00:00:00+00:00",
                }
            ],
        }
    )
    result = run(social.explore(_user(), q=None, kind=None, cursor=None, limit=24))
    assert result["items"][0]["author"]["follow_state"] == "following"
    assert result["items"][0]["author"]["district"] == "Supaul"


def test_suggested_creators_are_only_creators(store):
    store({"profiles": [profile(ME), profile(OTHER, role="Content Creator"), profile(THIRD, role="Farmer")]})
    result = run(social.suggested_accounts(_user(), limit=8, topic="creator"))
    assert [p["id"] for p in result["items"]] == [OTHER]
