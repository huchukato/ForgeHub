"""Async client for the RunPod serverless HTTP API (/run + /status)."""

import asyncio
import json
from typing import Any

import aiohttp

from forgehub_backend.config import SETTINGS


TERMINAL_STATES = {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}


async def list_endpoints(api_key: str | None = None) -> list[dict[str, Any]]:
    """List the account's serverless endpoints (REST v1). Lets the UI fill in
    endpoint ids instead of asking the user to copy them from the console."""
    key = api_key or SETTINGS.runpod_api_key
    if not key:
        raise RuntimeError("RunPod API key not set")
    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=20),
        headers={"Authorization": f"Bearer {key}"},
    ) as session:
        async with session.get("https://rest.runpod.io/v1/endpoints") as resp:
            body = await resp.text()
            if not resp.ok:
                raise RuntimeError(f"RunPod {resp.status}: {body[:300]}")
            data = json.loads(body)
    return [
        {
            "id": ep.get("id", ""),
            "name": ep.get("name", ""),
            "gpus": ep.get("gpuIds") or ep.get("gpuTypeIds") or "",
            "workers": ep.get("workersMax"),
            "createdAt": ep.get("createdAt", ""),
        }
        for ep in (data if isinstance(data, list) else data.get("endpoints", []))
    ]


class RunPodClient:
    def __init__(
        self,
        endpoint_id: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        self.api_key = api_key or SETTINGS.runpod_api_key
        if base_url:
            self.base_url = base_url.rstrip("/")
        else:
            endpoint_id = endpoint_id or SETTINGS.runpod_endpoint_id
            self.base_url = f"https://api.runpod.ai/v2/{endpoint_id}"
        self._session: aiohttp.ClientSession | None = None

    async def _session_or_new(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=120),
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None

    async def _request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        session = await self._session_or_new()
        async with session.request(method, f"{self.base_url}{path}", **kwargs) as response:
            body = await response.text()
            if not response.ok:
                raise RuntimeError(f"RunPod {response.status}: {body[:500]}")
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                raise RuntimeError(f"RunPod returned non-JSON response: {body[:500]}")

    async def run(self, job_input: dict[str, Any]) -> str:
        """Queue a job; returns the RunPod job id."""
        result = await self._request("POST", "/run", json={"input": job_input})
        job_id = result.get("id")
        if not job_id:
            raise RuntimeError(f"RunPod /run did not return a job id: {result}")
        return job_id

    async def status(self, job_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/status/{job_id}")

    async def cancel(self, job_id: str) -> dict[str, Any]:
        return await self._request("POST", f"/cancel/{job_id}")

    async def wait_for_completion(
        self,
        job_id: str,
        timeout: float | None = None,
        poll_interval: float | None = None,
    ) -> dict[str, Any]:
        """Poll /status until a terminal state; returns the full status payload."""
        timeout = timeout or SETTINGS.runpod_job_timeout
        poll_interval = poll_interval or SETTINGS.runpod_poll_interval
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            result = await self.status(job_id)
            state = result.get("status", "")
            if state in TERMINAL_STATES:
                return result
            await asyncio.sleep(poll_interval)
        return {"id": job_id, "status": "TIMED_OUT", "error": f"job exceeded {timeout}s"}
