"""Mirror-sync the Garage wildcards into the user storage dir.

Port of ComfyUI-TagForge's boot-sync: the ComfyUI-Garage repo is the source
of truth for the pmp/mmh3 wildcards, so end-user installs track it without
waiting for a ForgeHub release. Runs at backend startup in a daemon thread;
the wildcard loader's mtime watcher picks up refreshed files on its own.
"""

import json
import os
import pathlib
import threading
import urllib.request

from forgehub_backend.config import SETTINGS

_GARAGE_TREE_URL = "https://api.github.com/repos/huchukato/ComfyUI-Garage/git/trees/master?recursive=1"
_GARAGE_WILDCARDS_URL = "https://github.com/huchukato/ComfyUI-Garage/raw/master/wildcards"
_WILDCARD_EXTS = {".yaml", ".yml", ".txt"}
_GARAGE_WILDCARDS = (
    "mmh3/camera.yaml",
    "mmh3/music.yaml",
    "mmh3/nsfw.yaml",
    "mmh3/style.yaml",
    "mmh3/vfx.yaml",
    "pmp/act.yaml",
    "pmp/actff.yaml",
    "pmp/actffm.yaml",
    "pmp/actmmf.yaml",
    "pmp/actsolo.yaml",
    "pmp/blwjob.yaml",
    "pmp/qwen21.yaml",
    "pmp/prmpt/acc.yaml",
    "pmp/prmpt/char.yaml",
    "pmp/prmpt/clths.yaml",
    "pmp/prmpt/dynmc.yaml",
    "pmp/prmpt/exprss.yaml",
    "pmp/prmpt/hair.yaml",
    "pmp/prmpt/imgcmp.yaml",
    "pmp/prmpt/lctns.yaml",
    "pmp/prmpt/lens.yaml",
    "pmp/prmpt/light.yaml",
    "pmp/prmpt/pose.yaml",
    "pmp/prmpt/styles.yaml",
)


def garage_wildcard_list() -> list[str]:
    """Live file list under wildcards/ in the Garage repo; bundled list offline."""
    try:
        req = urllib.request.Request(_GARAGE_TREE_URL, headers={"User-Agent": "ForgeHub"})
        tree = json.loads(urllib.request.urlopen(req, timeout=10).read())
        paths = [
            blob["path"][len("wildcards/"):]
            for blob in tree.get("tree", [])
            if blob.get("type") == "blob"
            and blob["path"].startswith("wildcards/")
            and pathlib.PurePosixPath(blob["path"]).suffix.lower() in _WILDCARD_EXTS
        ]
        if paths:
            return paths
    except Exception as exc:
        print(f"[ForgeHub] Garage wildcard listing failed, using bundled list: {exc}")
    return list(_GARAGE_WILDCARDS)


def sync_garage_wildcards(target: pathlib.Path, upstream: list[str]) -> bool:
    """Mirror the upstream file list into target (adds, updates, deletes)."""
    manifest = target / ".garage-manifest"
    try:
        prev = set(manifest.read_text().splitlines()) if manifest.exists() else set()
    except Exception:
        prev = set()
    managed = {rel.split("/")[0] for rel in upstream} | {rel.split("/")[0] for rel in prev}
    try:
        local = {p.relative_to(target).as_posix() for p in target.rglob("*")
                 if p.is_file() and p.name != ".garage-manifest"}
    except Exception:
        local = set()
    updated = False
    for rel in (prev | {rel for rel in local if rel.split("/")[0] in managed}) - set(upstream):
        try:
            (target / rel).unlink()
            updated = True
            print(f"[ForgeHub] wildcard removed (gone from Garage): {rel}")
        except Exception as exc:
            print(f"[ForgeHub] wildcard removal failed {rel}: {exc}")
    for rel in upstream:
        try:
            data = urllib.request.urlopen(f"{_GARAGE_WILDCARDS_URL}/{rel}", timeout=10).read()
            dest = target / rel
            if dest.exists() and dest.read_bytes() == data:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            updated = True
            print(f"[ForgeHub] wildcard updated from Garage: {rel}")
        except Exception as exc:
            print(f"[ForgeHub] wildcard sync skipped {rel}: {exc}")
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


def start_wildcard_sync() -> None:
    """Kick off the boot-sync unless the dirs come from an explicit env override."""
    if os.getenv("FORGEHUB_WILDCARD_DIRS"):
        return

    def _run():
        target = SETTINGS.storage_dir / "wildcards"
        try:
            if sync_garage_wildcards(target, garage_wildcard_list()):
                from forgehub_backend.wildcards import WildcardLoader
                WildcardLoader.refresh()
        except Exception as exc:
            print(f"[ForgeHub] wildcard sync failed: {exc}")

    threading.Thread(target=_run, daemon=True, name="garage-wildcard-sync").start()
