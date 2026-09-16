"""ForgeHub runtime configuration."""

import os
from pathlib import Path


class Settings:
    def __init__(self):
        self.app_host = os.getenv("FORGEHUB_HOST", "0.0.0.0")
        self.app_port = int(os.getenv("FORGEHUB_PORT", "8484"))
        self.comfy_host = os.getenv("COMFYUI_HOST", "localhost")
        self.comfy_port = int(os.getenv("COMFYUI_PORT", "8188"))
        self.comfy_url = f"http://{self.comfy_host}:{self.comfy_port}"
        self.comfy_ws_url = f"ws://{self.comfy_host}:{self.comfy_port}"
        self.workflow_dir = Path(os.getenv("FORGEHUB_WORKFLOW_DIR", "/workspace/workflows"))
        self.comfy_input_dir = Path(os.getenv("COMFYUI_INPUT_DIR", "/workspace/ComfyUI/input"))
        self.comfy_output_dir = Path(os.getenv("COMFYUI_OUTPUT_DIR", "/workspace/ComfyUI/output"))
        self.max_upload_mb = int(os.getenv("FORGEHUB_MAX_UPLOAD_MB", "32"))
        self.max_chat_images = int(os.getenv("FORGEHUB_MAX_CHAT_IMAGES", "3"))
        self.max_image_pixels = int(os.getenv("FORGEHUB_MAX_IMAGE_PIXELS", "1024"))
        self.cors_origins = [origin.strip() for origin in os.getenv("FORGEHUB_CORS_ORIGINS", "*").split(",") if origin.strip()]
        self.log_level = os.getenv("FORGEHUB_LOG_LEVEL", "INFO").upper()


SETTINGS = Settings()
