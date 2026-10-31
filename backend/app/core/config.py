"""Application settings loaded from environment / .env."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
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

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
