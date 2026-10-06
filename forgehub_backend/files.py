"""File handling for uploads and output retrieval."""

import base64
import hashlib
import io
import re
import subprocess
import uuid
from pathlib import Path

from PIL import Image

from forgehub_backend.config import SETTINGS


def _safe_filename(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_\.\-]", "_", name)
    return base.strip("_") or "file"


def save_uploaded_image(data: str, original_name: str = "upload.png") -> str:
    """Save a base64-encoded image to ComfyUI input folder and return filename."""
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    image_bytes = base64.b64decode(data)
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    elif image.mode != "RGB":
        image = image.convert("RGB")

    max_size = SETTINGS.max_image_pixels
    if max(image.width, image.height) > max_size:
        ratio = max_size / max(image.width, image.height)
        new_size = (int(image.width * ratio), int(image.height * ratio))
        image = image.resize(new_size, Image.Resampling.LANCZOS)

    filename = f"forgehub_{uuid.uuid4().hex[:12]}_{_safe_filename(original_name)}"
    if not filename.lower().endswith((".jpg", ".jpeg")):
        filename = f"{filename.rsplit('.', 1)[0]}.jpg"

    target_dir = _output_base("input")
    target_dir.mkdir(parents=True, exist_ok=True)
    image.save(target_dir / filename, "JPEG", quality=85)
    return filename


def _is_serverless() -> bool:
    return SETTINGS.execution_mode == "serverless"


def _output_base(type_: str) -> Path:
    if _is_serverless():
        return (SETTINGS.storage_dir / ("uploads" if type_ == "input" else "outputs")).resolve()
    return (SETTINGS.comfy_output_dir if type_ == "output" else SETTINGS.comfy_input_dir).resolve()


def save_output_b64(filename: str, b64: str, subfolder: str = "") -> Path:
    """Decode a base64 payload from a serverless job and store it locally."""
    target_dir = SETTINGS.storage_dir / "outputs" / subfolder if subfolder else SETTINGS.storage_dir / "outputs"
    target_dir.mkdir(parents=True, exist_ok=True)
    base = _safe_filename(filename)
    target = (target_dir / base).resolve()
    # Avoid overwriting earlier outputs that share the same ComfyUI filename.
    if target.exists():
        stem = Path(base).stem
        suffix = Path(base).suffix
        counter = 1
        while True:
            target = (target_dir / f"{stem}_{counter}{suffix}").resolve()
            if not target.exists():
                break
            counter += 1
    if target_dir.resolve() not in target.parents and target != target_dir.resolve():
        raise ValueError(f"Path escapes storage directory: {filename}")
    target.write_bytes(base64.b64decode(b64))
    return target


def save_uploaded_b64(data: str, original_name: str = "upload.png") -> str:
    """Store an upload under storage/uploads and return the filename."""
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    filename = f"forgehub_{uuid.uuid4().hex[:12]}_{_safe_filename(original_name)}"
    target_dir = SETTINGS.storage_dir / "uploads"
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / filename).write_bytes(raw)
    return filename


def read_uploaded_b64(filename: str) -> str:
    """Return an upload from storage as base64 (to embed in a serverless job)."""
    path = (SETTINGS.storage_dir / "uploads" / _safe_filename(filename)).resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Upload not found: {filename}")
    return base64.b64encode(path.read_bytes()).decode("ascii")


def output_path(filename: str, subfolder: str = "", type_: str = "output") -> Path:
    base = _output_base(type_)
    path = base
    if subfolder:
        path = path / subfolder
    path = (path / filename).resolve()
    if path != base and base not in path.parents:
        raise FileNotFoundError(f"Path escapes base directory: {filename}")
    return path


def read_output_file(filename: str, subfolder: str = "", type_: str = "output") -> bytes:
    path = output_path(filename, subfolder, type_)
    if not path.is_file():
        raise FileNotFoundError(f"Output not found: {filename}")
    return path.read_bytes()


def delete_output_file(filename: str, subfolder: str = "") -> None:
    path = output_path(filename, subfolder, "output")
    if not path.is_file():
        raise FileNotFoundError(f"Output not found: {filename}")
    path.unlink()
    thumb_dir = SETTINGS.storage_dir / "thumbs"
    if thumb_dir.is_dir():
        for t in thumb_dir.glob(f"{_thumb_name(path)}_*.jpg"):
            t.unlink(missing_ok=True)


def _thumb_name(path: Path) -> str:
    return hashlib.sha1(str(path).encode()).hexdigest()[:10]


def _thumb_key(path: Path, mtime: int | None = None) -> str:
    mt = path.stat().st_mtime_ns if mtime is None else mtime
    return hashlib.sha1(f"{path}:{mt}".encode()).hexdigest()[:16]


def thumbnail_path(filename: str, subfolder: str = "") -> Path | None:
    """Return (and lazily generate) a cached JPEG thumbnail for an output."""
    path = output_path(filename, subfolder, "output")
    if not path.is_file():
        raise FileNotFoundError(f"Output not found: {filename}")
    ext = path.suffix.lower()
    is_video = ext in (".mp4", ".webm", ".mov")
    is_image = ext in (".png", ".jpg", ".jpeg", ".webp", ".gif")
    if not (is_video or is_image):
        return None
    thumb_dir = SETTINGS.storage_dir / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb = thumb_dir / f"{_thumb_name(path)}_{_thumb_key(path)}.jpg"
    if thumb.is_file():
        return thumb
    tmp = thumb.with_suffix(".tmp.jpg")
    try:
        if is_video:
            subprocess.run(
                ["ffmpeg", "-y", "-ss", "0.5", "-i", str(path),
                 "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", str(tmp)],
                check=True, capture_output=True, timeout=30,
            )
        else:
            img = Image.open(path)
            img.thumbnail((480, 480))
            img.convert("RGB").save(tmp, "JPEG", quality=80)
        tmp.rename(thumb)
        return thumb
    except Exception:
        tmp.unlink(missing_ok=True)
        return None
