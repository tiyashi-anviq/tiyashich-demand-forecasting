from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from app.config import settings

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED = {".csv", ".xlsx"}
CHUNK = 1024 * 1024


def _describe(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "size": stat.st_size,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    }


@router.get("")
def list_uploads():
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    files = [p for p in settings.upload_dir.iterdir() if p.suffix.lower() in ALLOWED]
    return sorted((_describe(p) for p in files), key=lambda f: f["uploaded_at"], reverse=True)


@router.post("")
async def upload(file: UploadFile):
    name = Path(file.filename or "").name
    if Path(name).suffix.lower() not in ALLOWED:
        raise HTTPException(400, "Only .csv and .xlsx files are accepted.")

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.upload_dir / name
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(CHUNK):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB.")
                out.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return _describe(dest)
