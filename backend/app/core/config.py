"""Application settings loaded from environment / .env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# `.env` is read from the current directory first (Docker / backend-local) and
# then from the repo root, so `uvicorn app.main:app` works from either place.
ENV_FILES = (Path(".env"), Path(__file__).resolve().parents[3] / ".env")


class Settings(BaseSettings):
    """Runtime configuration. Secrets are read here and never sent to a client."""
    model_config = SettingsConfigDict(
        env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore"
    )

    APP_NAME: str = "CenAGRI-AI"
    APP_ENV: str = "development"
    APP_PORT: int = 8000
    APP_DEBUG: bool = True

    # Supabase → Project Settings → Database → Connection string ("Session pooler")
    # Use the postgresql+psycopg:// prefix for SQLAlchemy.
    DATABASE_URL: str = "postgresql+psycopg://postgres:change_me@db.YOUR_PROJECT_REF.supabase.co:5432/postgres"

    JWT_SECRET: str = "change_me_to_a_long_random_string"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    CORS_ORIGINS: str = "http://localhost:5173"

    # ── Central admin panel ────────────────────────────────────────────────
    # Admin APIs talk to Postgres through the service role, so the browser never
    # holds a credential that can read admin tables directly. When these are
    # empty the admin router is not mounted at all — a safe default.
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    # Supabase signs access tokens with the project's signing key. FastAPI only
    # VERIFIES those tokens (RS256/ES256 via JWKS, or the legacy HS256 secret);
    # it never mints tokens of its own.
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    # Admin sessions are shorter than a farmer's: a stolen admin token should
    # age out fast.
    ADMIN_SESSION_MAX_MINUTES: int = 480
    # Enforce MFA for every admin action. Off by default so a fresh install is
    # usable; turn it on once admins have enrolled a factor.
    ADMIN_MFA_REQUIRED: bool = False
    # Throttle: max admin API requests per admin per minute (0 disables).
    ADMIN_RATE_LIMIT_PER_MINUTE: int = 240

    # data.gov.in → "Current Daily Price of Various Commodities from Various
    # Markets (Mandi)". Server-side only; never expose this key to the browser.
    DATA_GOV_API_KEY: str = ""
    DATA_GOV_BASE_URL: str = "https://api.data.gov.in"

    # AI crop advisory. Any OpenAI-compatible chat-completions endpoint works
    # (OpenAI, Groq, Together, a local vLLM/Ollama). Keys are server-side only.
    # With no key set the advisory endpoint answers with rule-based guidance and
    # says so, rather than inventing a farm-specific diagnosis.
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def admin_enabled(self) -> bool:
        """True only when the backend can verify sessions AND read admin data."""
        has_secret = bool(self.SUPABASE_JWT_SECRET or self.SUPABASE_JWKS_URL)
        return bool(self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY and has_secret)

    @property
    def user_api_enabled(self) -> bool:
        """True when a signed-in user's token can be verified AND their rows read.

        The farmer read APIs (overview, finance, advisory) run after the caller's
        Supabase token is verified here, so they need the same three values the
        admin panel does — but no session-age or MFA policy of their own.
        """
        return self.admin_enabled

    @property
    def SUPABASE_JWKS_URL(self) -> str:
        """JWKS endpoint for modern (RS256/ES256) Supabase projects."""
        if not self.SUPABASE_URL:
            return ""
        return f"{self.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"


settings = Settings()
