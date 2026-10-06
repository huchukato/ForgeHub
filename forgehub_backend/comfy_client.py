"""Async client for ComfyUI HTTP and WebSocket APIs."""

import asyncio
import json
import uuid
from typing import Any
from urllib.parse import quote

import aiohttp
import websockets

from forgehub_backend.config import SETTINGS


class ComfyClient:
    def __init__(self, base_url: str | None = None, ws_url: str | None = None):
        self.base_url = base_url or SETTINGS.comfy_url
        self.ws_url = ws_url or SETTINGS.comfy_ws_url
        self._session: aiohttp.ClientSession | None = None
        self._object_info: dict[str, Any] | None = None

    async def _session_or_new(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120))
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def get(self, path: str, **kwargs) -> Any:
        session = await self._session_or_new()
        async with session.get(f"{self.base_url}{path}", **kwargs) as response:
            response.raise_for_status()
            return await response.json()

    async def post(self, path: str, **kwargs) -> Any:
        session = await self._session_or_new()
        async with session.post(f"{self.base_url}{path}", **kwargs) as response:
            response.raise_for_status()
            return await response.json()

    async def get_bytes(self, path: str, **kwargs) -> bytes:
        session = await self._session_or_new()
        async with session.get(f"{self.base_url}{path}", **kwargs) as response:
            response.raise_for_status()
            return await response.read()

    async def queue_prompt(self, workflow: dict[str, Any], client_id: str | None = None) -> str:
        client_id = client_id or str(uuid.uuid4())
        payload = {"prompt": workflow, "client_id": client_id}
        result = await self.post("/prompt", json=payload)
        return result["prompt_id"], client_id

    async def interrupt(self) -> None:
        """Interrupt the currently running prompt (no-op if nothing runs)."""
        try:
            await self.post("/interrupt")
        except Exception:
            pass

    async def delete_from_queue(self, prompt_id: str) -> None:
        """Remove a queued (not yet running) prompt from the queue."""
        try:
            await self.post("/queue", json={"delete": [prompt_id]})
        except Exception:
            pass

    async def get_history(self, prompt_id: str | None = None) -> dict[str, Any]:
        if prompt_id:
            return await self.get(f"/history/{prompt_id}")
        return await self.get("/history")

    async def object_info(self, invalidate: bool = False) -> dict[str, Any]:
        """Fetch /object_info (node class specs), cached for the client lifetime."""
        if invalidate or self._object_info is None:
            self._object_info = await self.get("/object_info")
        return self._object_info

    def view_url(self, filename: str, subfolder: str = "", type_: str = "output") -> str:
        # URL relative to the ForgeHub backend (proxied via /outputs/{filename})
        return f"/outputs/{quote(filename)}?subfolder={quote(subfolder)}&type={type_}"

    async def download_output(self, filename: str, subfolder: str = "", type_: str = "output") -> bytes:
        return await self.get_bytes(f"/view?filename={quote(filename)}&subfolder={quote(subfolder)}&type={type_}")

    async def stream_events(self, client_id: str, callback):
        uri = f"{self.ws_url}/ws?clientId={client_id}"
        try:
            async with websockets.connect(uri, open_timeout=10, close_timeout=10) as websocket:
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue
                    if isinstance(message, bytes):
                        continue
                    try:
                        data = json.loads(message)
                    except json.JSONDecodeError:
                        continue
                    if asyncio.iscoroutinefunction(callback):
                        await callback(data)
                    else:
                        callback(data)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if asyncio.iscoroutinefunction(callback):
                await callback({"type": "forgehub_error", "message": str(exc)})
            else:
                callback({"type": "forgehub_error", "message": str(exc)})


COMFY_CLIENT = ComfyClient()
