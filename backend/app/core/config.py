"""Application settings loaded from environment / .env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# `.env` is read from the current directory first (Docker / backend-local) and
# then from the repo root, so `uvicorn app.main:app` works from either place.
ENV_FILES = (Path(".env"), Path(__file__).resolve().parents[3] / ".env")


class Settings(BaseSettings):
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


settings = Settings()
