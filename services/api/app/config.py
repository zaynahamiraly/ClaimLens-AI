from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    supabase_url: str = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
    supabase_publishable_key: str = os.getenv(
        "SUPABASE_PUBLISHABLE_KEY",
        os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")),
    )
    supabase_secret_key: str = os.getenv(
        "SUPABASE_SECRET_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    )
    storage_bucket: str = os.getenv("SUPABASE_STORAGE_BUCKET", "claim-documents")
    max_file_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
    max_claim_documents: int = int(os.getenv("MAX_CLAIM_DOCUMENTS", "10"))
    tesseract_cmd: str | None = os.getenv("TESSERACT_CMD") or None
    cors_origins_raw: str = os.getenv("CORS_ORIGINS", "http://localhost:3000")

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.cors_origins_raw.split(",") if value.strip()]

    def require_supabase(self) -> None:
        missing = []
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_publishable_key:
            missing.append("SUPABASE_PUBLISHABLE_KEY")
        if missing:
            raise RuntimeError(f"Missing server configuration: {', '.join(missing)}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
