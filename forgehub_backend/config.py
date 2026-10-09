"""ForgeHub runtime configuration."""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


class Settings:
    def __init__(self):
        self.app_host = os.getenv("FORGEHUB_HOST", "0.0.0.0")
        self.app_port = int(os.getenv("FORGEHUB_PORT", "8484"))
        self.workflow_dir = Path(os.getenv("FORGEHUB_WORKFLOW_DIR", "/workspace/workflows"))
        self.max_upload_mb = int(os.getenv("FORGEHUB_MAX_UPLOAD_MB", "256"))
        self.max_chat_images = int(os.getenv("FORGEHUB_MAX_CHAT_IMAGES", "3"))
        self.max_image_pixels = int(os.getenv("FORGEHUB_MAX_IMAGE_PIXELS", "1024"))
        self.cors_origins = [origin.strip() for origin in os.getenv("FORGEHUB_CORS_ORIGINS", "*").split(",") if origin.strip()]
        self.log_level = os.getenv("FORGEHUB_LOG_LEVEL", "INFO").upper()
        # Jobs always run on a RunPod serverless endpoint (/run + /status).
        self.runpod_api_key = os.getenv("RUNPOD_API_KEY", "")
        self.runpod_endpoint_id = os.getenv("RUNPOD_ENDPOINT_ID", "")
        self.runpod_base_url = f"https://api.runpod.ai/v2/{self.runpod_endpoint_id}"
        self.runpod_poll_interval = float(os.getenv("RUNPOD_POLL_INTERVAL", "5"))
        self.runpod_job_timeout = int(os.getenv("RUNPOD_JOB_TIMEOUT", "1800"))
        # Optional S3-compatible offload for large outputs (job outputs over
        # ~10MB come back as presigned URLs instead of base64 — RunPod drops
        # results over ~20MB). Points at the endpoint's network volume S3 API.
        self.runpod_s3_endpoint = os.getenv("RUNPOD_S3_ENDPOINT_URL", "")
        self.runpod_s3_bucket = os.getenv("RUNPOD_S3_BUCKET", "")
        self.runpod_s3_access_id = os.getenv("RUNPOD_S3_ACCESS_ID", "")
        self.runpod_s3_access_secret = os.getenv("RUNPOD_S3_ACCESS_SECRET", "")
        self.runpod_s3_region = os.getenv("RUNPOD_S3_REGION", "")
        self.runpod_s3_datacenter = os.getenv("RUNPOD_S3_DATACENTER", "")
        if not self.runpod_s3_endpoint and self.runpod_s3_datacenter:
            self.runpod_s3_endpoint = f"https://s3api-{self.runpod_s3_datacenter.lower()}.runpod.io/"
        # Local storage for serverless outputs and uploads (base64 payloads
        # have no ComfyUI filesystem behind them).
        self.storage_dir = Path(os.getenv("FORGEHUB_STORAGE_DIR", "data/storage"))
        # Optional chat/prompt-assist endpoint. In serverless mode there is no
        # persistent ComfyUI, so chat is disabled unless this points somewhere
        # (e.g. a running pod exposing /qwenvl/chat).
        self.chat_base_url = os.getenv("FORGEHUB_CHAT_BASE_URL", "")
        # Alternative: any OpenAI-compatible /v1 endpoint (Ollama :11434/v1,
        # llama.cpp server :8080/v1, OpenRouter...). Takes precedence over
        # chat_base_url when set — no ComfyUI/QwenVL-Mod needed.
        self.chat_llm_url = os.getenv("FORGEHUB_CHAT_LLM_URL", "").rstrip("/")
        self.chat_llm_model = os.getenv("FORGEHUB_CHAT_LLM_MODEL", "openrouter/free")
        self.chat_llm_key = os.getenv("FORGEHUB_CHAT_LLM_KEY", "")
        # TagForge wildcard directories (colon-separated) for prompt expansion
        # done server-side before the job reaches ComfyUI/RunPod.
        self.wildcard_dirs = os.getenv("FORGEHUB_WILDCARD_DIRS") or (
            "wildcards" if Path("wildcards").is_dir() else "")
        # Directory with the built frontend (index.html + assets). When set and
        # valid, the backend serves the ForgeHub GUI at "/".
        self.frontend_dir = os.getenv(
            "FORGEHUB_FRONTEND_DIR",
            str(Path(__file__).resolve().parent.parent / "forgehub-app" / "dist"),
        )


SETTINGS = Settings()

# Runtime-editable settings (settable from the GUI, no restart needed).
# Persisted as JSON; applied on top of env vars at startup.
SETTINGS_FILE = Path(os.getenv("FORGEHUB_SETTINGS_FILE", "data/settings.json"))

_SETTINGS_KEYS = (
    "runpod_api_key",
    "runpod_endpoint_id",
    "chat_llm_url",
    "chat_llm_model",
    "chat_llm_key",
    "runpod_s3_access_id",
    "runpod_s3_access_secret",
    "runpod_s3_bucket",
    "runpod_s3_datacenter",
)


def apply_overrides(data: dict):
    for key in _SETTINGS_KEYS:
        value = data.get(key)
        if value:
            setattr(SETTINGS, key, value)
    SETTINGS.runpod_base_url = f"https://api.runpod.ai/v2/{SETTINGS.runpod_endpoint_id}"
    if SETTINGS.runpod_s3_datacenter:
        SETTINGS.runpod_s3_endpoint = f"https://s3api-{SETTINGS.runpod_s3_datacenter.lower()}.runpod.io/"


def load_overrides():
    try:
        import json
        if SETTINGS_FILE.exists():
            apply_overrides(json.loads(SETTINGS_FILE.read_text()))
    except Exception:
        pass


def save_overrides(data: dict):
    import json
    current = {}
    if SETTINGS_FILE.exists():
        try:
            current = json.loads(SETTINGS_FILE.read_text())
        except Exception:
            pass
    current.update({k: v for k, v in data.items() if k in _SETTINGS_KEYS and v})
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(current, indent=2))
    apply_overrides(current)


load_overrides()
