"""File handling for uploads and output retrieval."""

import base64
import io
import re
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

    target = SETTINGS.comfy_input_dir / filename
    SETTINGS.comfy_input_dir.mkdir(parents=True, exist_ok=True)
    image.save(target, "JPEG", quality=85)
    return filename


def read_output_file(filename: str, subfolder: str = "", type_: str = "output") -> bytes:
    base = (SETTINGS.comfy_output_dir if type_ == "output" else SETTINGS.comfy_input_dir).resolve()
    path = base
    if subfolder:
        path = path / subfolder
    path = (path / filename).resolve()
    if path != base and base not in path.parents:
        raise FileNotFoundError(f"Path escapes base directory: {filename}")
    with open(path, "rb") as f:
        return f.read()
