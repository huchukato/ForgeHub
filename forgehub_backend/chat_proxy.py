"""Proxy chat requests to ComfyUI-QwenVL-Mod endpoints."""

from typing import Any

import aiohttp

from forgehub_backend.config import SETTINGS
from forgehub_backend.models import ChatRequest, ChatResponse


class ChatProxy:
    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or SETTINGS.comfy_url
        self._session: aiohttp.ClientSession | None = None

    async def _session_or_new(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=600))
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def models(self) -> dict[str, list[str]]:
        session = await self._session_or_new()
        async with session.get(f"{self.base_url}/qwenvl/chat/models") as response:
            response.raise_for_status()
            return await response.json()

    async def chat(self, request: ChatRequest, graph: dict[str, Any] | None = None) -> ChatResponse:
        session = await self._session_or_new()
        payload = {
            "backend": request.backend,
            "model": request.model,
            "messages": [msg.model_dump() for msg in request.messages],
            "images": request.images[: SETTINGS.max_chat_images],
            "options": request.options,
        }
        if graph is not None:
            payload["graph"] = graph
        async with session.post(f"{self.base_url}/qwenvl/chat", json=payload) as response:
            response.raise_for_status()
            data = await response.json()
            return ChatResponse(**data)


CHAT_PROXY = ChatProxy()
