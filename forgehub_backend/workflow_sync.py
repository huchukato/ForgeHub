"""Mirror-sync the ForgeHub workflows into the user storage dir.

The packaged app bundles the workflows at build time (resourcesPath/workflows),
so a workflow edit would otherwise wait for the next app release. The ForgeHub
repo is the source of truth for both the API workflows and their .meta.json —
this syncs them at backend startup, the same way the serverless workers pull
their templates. Offline or on failure the bundled copy keeps working.
"""

import json
import os
import pathlib
import threading
import urllib.request

from forgehub_backend.config import SETTINGS

_TREE_URL = "https://api.github.com/repos/huchukato/ForgeHub/git/trees/main?recursive=1"
_RAW_URL = "https://raw.githubusercontent.com/huchukato/ForgeHub/main/{path}"


def forgehub_workflow_list() -> list[str]:
    """Live file list under workflows/ in the ForgeHub repo; empty offline."""
    try:
        req = urllib.request.Request(_TREE_URL, headers={"User-Agent": "ForgeHub"})
        tree = json.loads(urllib.request.urlopen(req, timeout=10).read())
        return [
            blob["path"]
            for blob in tree.get("tree", [])
            if blob.get("type") == "blob"
            and blob["path"].startswith("workflows/")
            and blob["path"].endswith(".json")
        ]
    except Exception as exc:
        print(f"[ForgeHub] workflow listing failed: {exc}")
    return []


def sync_forgehub_workflows(target: pathlib.Path, upstream: list[str]) -> bool:
    """Mirror the upstream file list into target (adds, updates, deletes)."""
    if not upstream:
        return False
    manifest = target / ".forgehub-manifest"
    try:
        prev = set(manifest.read_text().splitlines()) if manifest.exists() else set()
    except Exception:
        prev = set()
    updated = False
    for rel in prev - set(upstream):
        try:
            (target / rel).unlink()
            updated = True
            print(f"[ForgeHub] workflow removed (gone from repo): {rel}")
        except Exception as exc:
            print(f"[ForgeHub] workflow removal failed {rel}: {exc}")
    for rel in upstream:
        try:
            data = urllib.request.urlopen(_RAW_URL.format(path=rel), timeout=30).read()
            dest = target / rel
            if dest.exists() and dest.read_bytes() == data:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            updated = True
            print(f"[ForgeHub] workflow updated from repo: {rel}")
        except Exception as exc:
            print(f"[ForgeHub] workflow sync skipped {rel}: {exc}")
    try:
        manifest.write_text("\n".join(upstream))
    except Exception:
        pass
    for child in sorted(target.rglob("*"), key=lambda p: -len(p.parts)):
        try:
            if child.is_dir() and not any(child.iterdir()):
                child.rmdir()
        except Exception:
            pass
    return updated


def start_workflow_sync() -> None:
    """Point the catalog at the synced copy and refresh it in the background."""
    if os.getenv("FORGEHUB_NO_WORKFLOW_SYNC"):
        return

    target = SETTINGS.storage_dir / "workflows"
    # A previous sync already populated the dir: use it right away.
    if target.is_dir() and any(target.rglob("*.json")):
        SETTINGS.workflow_dir = target

    def _run():
        try:
            if sync_forgehub_workflows(target, forgehub_workflow_list()):
                SETTINGS.workflow_dir = target
        except Exception as exc:
            print(f"[ForgeHub] workflow sync failed — bundled workflows: {exc}")

    threading.Thread(target=_run, daemon=True, name="forgehub-workflow-sync").start()
