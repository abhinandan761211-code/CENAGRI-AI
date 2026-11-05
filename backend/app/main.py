"""CenAGRI-AI — FastAPI application entrypoint."""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import settings
from app.services import mandi


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Prefetch one page of mandi prices in the background so the dashboard's
    # first load is fast — but never delay binding the port on a slow feed.
    warm = asyncio.create_task(mandi.warm_cache())
    yield
    warm.cancel()
    await mandi.close_client()


app = FastAPI(
    lifespan=lifespan,
    title=settings.APP_NAME,
    version="0.1.0",
    docs_url="/docs" if settings.APP_DEBUG else None,
    openapi_url="/openapi.json" if settings.APP_DEBUG else None,
)

# Local development: Vite picks the next free port when 5173 is taken (the QA
# harness runs on 5210). Only 5173/3000 were in CORS_ORIGINS, so every API call
# from those ports failed the preflight. Any loopback port is fine in dev;
# production still uses the explicit CORS_ORIGINS list.
#
# ONE middleware only. Starlette applies the LAST added middleware outermost, so
# registering CORSMiddleware twice silently dropped the first registration — the
# browser then saw "no Access-Control-Allow-Origin" and every request failed
# with a CORS error even though the origin was listed.
_dev_local_origin = r"^http://(localhost|127\.0\.0\.1)(:\d+)?$" if settings.APP_ENV == "development" else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=_dev_local_origin,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}
