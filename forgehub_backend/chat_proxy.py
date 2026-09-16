"""Proxy chat requests to ComfyUI-QwenVL-Mod endpoints."""

import json
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

    @staticmethod
    async def _raise_with_body(response: aiohttp.ClientResponse) -> None:
        body = await response.text()
        try:
            detail = json.loads(body).get("error") or body
        except (json.JSONDecodeError, AttributeError):
            detail = body
        raise RuntimeError(f"ComfyUI {response.status}: {detail or response.reason}")

    async def models(self) -> dict[str, list[str]]:
        session = await self._session_or_new()
        async with session.get(f"{self.base_url}/qwenvl/chat/models") as response:
            if not response.ok:
                await self._raise_with_body(response)
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
            if not response.ok:
                await self._raise_with_body(response)
            data = await response.json()
            return ChatResponse(**data)


CHAT_PROXY = ChatProxy()
