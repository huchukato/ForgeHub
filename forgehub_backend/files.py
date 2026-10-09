"""File handling for uploads and output retrieval."""

import base64
import hashlib
import io
import json
import re
import shutil
import struct
import subprocess
import urllib.request
import uuid
import zlib
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


def _output_base(type_: str) -> Path:
    return (SETTINGS.storage_dir / ("uploads" if type_ == "input" else "outputs")).resolve()


def _store_output(filename: str, data: bytes, subfolder: str = "") -> Path:
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
    target.write_bytes(data)
    return target


def save_output_b64(filename: str, b64: str, subfolder: str = "") -> Path:
    """Decode a base64 payload from a serverless job and store it locally."""
    return _store_output(filename, base64.b64decode(b64), subfolder)


def save_output_url(filename: str, url: str) -> Path:
    """Download a presigned output URL (S3 offload for large files) and store it."""
    with urllib.request.urlopen(url, timeout=600) as resp:
        return _store_output(filename, resp.read())


# --- Generation metadata embedded in output files -----------------------------
# The raw request parameters (prompt still containing __wildcards__), workflow
# id and the ShowText trace (expanded prompt, final QwenVL prompt) are embedded
# so the files themselves are the prompt history.

META_KEYWORD = "forgehub"
_EMBEDDABLE_CONTAINER = (".mp4", ".mov", ".webm", ".mkv", ".mp3", ".wav", ".flac", ".ogg", ".m4a")
_META_SUFFIX = ".meta.json"


def _png_text_chunk(keyword: str, text: str) -> bytes:
    data = keyword.encode("latin-1") + b"\x00" + text.encode("utf-8")
    return struct.pack(">I", len(data)) + b"tEXt" + data + struct.pack(">I", zlib.crc32(b"tEXt" + data))


def _embed_png(path: Path, payload: str) -> bool:
    raw = path.read_bytes()
    if not raw.startswith(b"\x89PNG\r\n\x1a\n") or len(raw) < 12:
        return False
    # Insert the new tEXt chunk just before the trailing IEND (12 bytes).
    path.write_bytes(raw[:-12] + _png_text_chunk(META_KEYWORD, payload) + raw[-12:])
    return True


def _ffmpeg_bin() -> str:
    """Locate ffmpeg: PATH first (dev), then common install paths (Electron apps
    get a minimal PATH), then the imageio-ffmpeg bundled binary."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    for cand in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"):
        if Path(cand).is_file():
            return cand
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _embed_container(path: Path, payload: str) -> bool:
    tmp = path.with_name(f"{path.stem}.embed_tmp{path.suffix}")
    # mp4/mov drop unknown metadata keys unless they go into the udta atom.
    mov_tags = ["-movflags", "use_metadata_tags"] if path.suffix.lower() in (".mp4", ".mov", ".m4a") else []
    try:
        r = subprocess.run(
            [_ffmpeg_bin(), "-y", "-i", str(path), "-map", "0", "-c", "copy",
             *mov_tags, "-metadata", f"{META_KEYWORD}={payload}", str(tmp)],
            capture_output=True, timeout=180,
        )
        if r.returncode != 0:
            tmp.unlink(missing_ok=True)
            return False
        tmp.replace(path)
        return True
    except Exception:
        tmp.unlink(missing_ok=True)
        return False


def _read_png_meta(path: Path) -> dict | None:
    try:
        data = path.read_bytes()
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return None
        off = 8
        while off + 8 <= len(data):
            length = struct.unpack(">I", data[off:off + 4])[0]
            ctype = data[off + 4:off + 8]
            if ctype == b"tEXt":
                body = data[off + 8:off + 8 + length]
                kw, _, val = body.partition(b"\x00")
                if kw.decode("latin-1", errors="replace") == META_KEYWORD:
                    return json.loads(val.decode("utf-8"))
            off += 12 + length
            if ctype == b"IEND":
                break
    except Exception:
        return None
    return None


def _ffprobe_bin() -> str:
    exe = shutil.which("ffprobe")
    if exe:
        return exe
    for cand in ("/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"):
        if Path(cand).is_file():
            return cand
    ff = _ffmpeg_bin()
    sib = str(Path(ff).with_name("ffprobe"))
    return sib if Path(sib).is_file() else "ffprobe"


def _read_container_meta(path: Path) -> dict | None:
    try:
        r = subprocess.run(
            [_ffprobe_bin(), "-v", "quiet", "-show_entries", "format_tags",
             "-of", "json", str(path)],
            capture_output=True, timeout=15,
        )
        tags = json.loads(r.stdout).get("format", {}).get("tags", {})
        for key, val in tags.items():
            if key.lower() == META_KEYWORD:
                return json.loads(val)
    except Exception:
        return None
    return None


def write_output_meta(path: Path, meta: dict) -> None:
    """Embed generation metadata in the output file; sidecar as fallback."""
    payload = json.dumps(meta, ensure_ascii=False)
    ext = path.suffix.lower()
    ok = False
    try:
        if ext == ".png":
            ok = _embed_png(path, payload)
        elif ext in _EMBEDDABLE_CONTAINER:
            ok = _embed_container(path, payload)
    except Exception:
        ok = False
    if not ok or ext in _EMBEDDABLE_CONTAINER:
        (path.parent / f"{path.name}{_META_SUFFIX}").write_text(payload, encoding="utf-8")


def _read_comfy_prompt(path: Path) -> dict | None:
    """Extract the ComfyUI API-prompt JSON embedded by the save node."""
    try:
        data = path.read_bytes()
    except Exception:
        return None
    ext = path.suffix.lower()
    decoder = json.JSONDecoder()
    if ext in (".jpg", ".jpeg"):
        i = data.find(b"Prompt:{")
        if i < 0:
            return None
        try:
            obj, _ = decoder.raw_decode(data[i + 7:].decode("utf-8", "replace"))
            return obj
        except Exception:
            return None
    if ext == ".png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return None
        off = 8
        try:
            while off + 8 <= len(data):
                length = struct.unpack(">I", data[off:off + 4])[0]
                ctype = data[off + 4:off + 8]
                if ctype == b"tEXt":
                    body = data[off + 8:off + 8 + length]
                    kw, _, val = body.partition(b"\x00")
                    if kw.decode("latin-1", errors="replace") == "prompt":
                        obj, _ = decoder.raw_decode(val.decode("utf-8"))
                        return obj
                off += 12 + length
                if ctype == b"IEND":
                    break
        except Exception:
            return None
    return None


_PRESET_POSITIVE = {
    "Pony": "score_9, score_8_up, score_7_up",
    "Illustrious": "masterwork, masterpiece, best quality, detailed, high detail, very aesthetic",
}


def _expanded_prompt(prompt_json: dict) -> str:
    """The resolved text the sampler actually consumed (wildcards expanded
    plus the model-preset prefix WildcardProcessor adds at run time —
    populated_text stores only the expansion)."""
    texts = []
    for node in prompt_json.values():
        if not isinstance(node, dict):
            continue
        inputs = node.get("inputs") or {}
        val = inputs.get("populated_text")
        if not (isinstance(val, str) and val.strip()):
            continue
        prefix = _PRESET_POSITIVE.get(inputs.get("base_model") or "", "")
        val = val.lstrip()
        if prefix and not val.startswith(prefix):
            val = f"{prefix}, {val}"
        texts.append(val)
    return "\n\n".join(texts)


def read_output_meta(path: Path) -> dict | None:
    """Read embedded/sidecar metadata for an output file."""
    ext = path.suffix.lower()
    meta = None
    if ext == ".png":
        meta = _read_png_meta(path)
    elif ext in _EMBEDDABLE_CONTAINER:
        meta = _read_container_meta(path)
    if meta is None:
        sidecar = path.parent / f"{path.name}{_META_SUFFIX}"
        if sidecar.is_file():
            try:
                meta = json.loads(sidecar.read_text(encoding="utf-8"))
            except Exception:
                meta = None
    if ext in (".jpg", ".jpeg", ".png"):
        pj = _read_comfy_prompt(path)
        expanded = _expanded_prompt(pj) if pj else ""
        if expanded:
            meta = meta or {"app": "forgehub", "parameters": {}, "texts": {}}
            meta["prompt_expanded"] = expanded
    return meta


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
    (path.parent / f"{path.name}{_META_SUFFIX}").unlink(missing_ok=True)
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
                [_ffmpeg_bin(), "-y", "-ss", "0.5", "-i", str(path),
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
