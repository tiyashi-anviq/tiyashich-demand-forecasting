from pathlib import Path

from pydantic_settings import BaseSettings

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    raw_data_dir: Path = ROOT / "er-data"
    parquet_dir: Path = ROOT / "api" / "data" / "parquet"
    clean_dir: Path = ROOT / "api" / "data" / "clean"
    upload_dir: Path = ROOT / "api" / "uploads"
    max_upload_mb: int = 200
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
