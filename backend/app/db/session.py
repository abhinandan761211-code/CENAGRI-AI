"""Database session factory (SQLAlchemy 2.x).

Two Session shapes live here:

* ``get_db`` — the ordinary application session, bound to ``DATABASE_URL``.
* ``get_admin_db`` — the admin panel's session. Admin endpoints run SQL against
  Supabase tables that are deliberately locked away from the browser, so this
  connection uses the service role through the Supabase REST interface
  (``app/db/admin_store.py``) rather than a second direct Postgres pool.

Keeping them separate is the point: an admin route cannot accidentally fall
back to a session that a normal user could influence, and the admin feature
degrades to "not configured" instead of leaking data when no credential is set.
"""

from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings
from app.db.admin_store import AdminStore

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_admin_db() -> AdminStore:
    """Service-role data access for the admin panel.

    Refuses to run when the service role is not configured, so a
    half-configured deployment fails closed (503) instead of open.
    """
    if not settings.admin_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The admin panel is not configured on this server.",
        )
    return AdminStore.from_settings(settings)


AdminStoreDep = Depends(get_admin_db)
