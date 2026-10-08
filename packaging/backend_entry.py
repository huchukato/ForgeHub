"""Entry point for the PyInstaller-frozen ForgeHub backend.

Packaged as a single binary and spawned by the Electron app as a child
process. Configuration arrives via environment variables set by the
launcher (paths point into the app's resources/userData, not the repo).
"""

import os

import certifi

os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

import uvicorn

from forgehub_backend.config import SETTINGS
from forgehub_backend.main import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host=SETTINGS.app_host,
        port=SETTINGS.app_port,
        log_level=SETTINGS.log_level.lower(),
    )
