from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "mysql+pymysql://root:password@localhost:3306/ai_hr"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"

    whisper_model: str = "base"
    whisper_device: str = "cuda"
    whisper_language: str = "tr"

    # MinIO settings kept for now (see storage/minio_storage.py) — the active
    # backend is LocalFileStorage below, wired via get_media_storage().
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket_name: str = "ai-hr-media"
    minio_secure: bool = False

    local_media_dir: str = r"C:\HR-Recordings"

    # KVKK-driven data retention windows (see app/services/data_retention.py).
    media_retention_days: int = 7
    transcript_retention_days: int = 30
    report_retention_days: int = 90

    # Days from account creation a candidate has to complete their
    # interview — automatic, not HR-set (see candidate_service.compute_interview_deadline).
    interview_deadline_days: int = 7

    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
