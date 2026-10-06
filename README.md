# ForgeHub

![ForgeHub](img/banner.jpeg)

A frontend for orchestrating ComfyUI workflows on Runpod Serverless endpoints. Python FastAPI backend + React/TypeScript frontend (web or Electron).

Companion to the workers: [runpod-qwen21](https://github.com/huchukato/runpod-qwen21) (Qwen Image 2.1 T2I/Edit + Pony) · [runpod-minimax-h3](https://github.com/huchukato/runpod-minimax-h3) (MiniMax H3 video+audio)

## Download (desktop app)

Get the latest build from [Releases](https://github.com/huchukato/ForgeHub/releases/latest) — the backend is bundled, nothing else to install:

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `ForgeHub-*-arm64.dmg` |
| Windows | `ForgeHub.Setup.*.exe` |
| Linux | `ForgeHub-*.AppImage` · `forgehub-app_*_amd64.deb` |

Unsigned builds — how to open them:

- **macOS**: run `xattr -dr com.apple.quarantine /Applications/ForgeHub.app` (or right-click → Open), or install [Sentinel](https://github.com/alienator88/Sentinel-App) — `brew install --cask sentinel` — and drop the app on "Allow unsigned app to launch".
- **Windows**: click "More info → Run anyway".

Then set your Runpod API key in **Settings** — "Detect from account" lists your endpoints automatically.

## Quick start (from source)

**macOS / Linux**

```bash
git clone https://github.com/huchukato/ForgeHub.git && cd ForgeHub
./start.sh
```

**Windows**

```bat
git clone https://github.com/huchukato/ForgeHub.git && cd ForgeHub
start.bat
```

The script handles everything: installs **uv** if missing, creates `.venv` and installs the backend (`pip install -e .`), runs `npm install` + frontend build, then starts on **http://127.0.0.1:8484**. On first run it copies `.env.example` → `.env`: fill it in (Runpod API key + endpoint id) and relaunch.

Options: `./start.sh --build` forces a frontend rebuild · `./start.sh --dev` starts backend + Vite dev server (:5173, hot reload).

Prerequisites: only **Node.js** (for the frontend build) — everything else is handled by uv.

## Execution

Jobs always run on a RunPod serverless endpoint: `/run` → `/status` poll → base64 output saved to `data/storage` and served from `/outputs/`. Set your API key + endpoint in Settings (or `.env`).

Wildcard expansion (`__pmp/…__`) and runtime selects happen backend-side — the `wildcards/` directory is bundled; override with `FORGEHUB_WILDCARD_DIRS` (colon-separated).

## Environment variables

- `FORGEHUB_HOST` / `FORGEHUB_PORT` — backend bind (default `0.0.0.0:8484`)
- `RUNPOD_API_KEY` / `RUNPOD_ENDPOINT_ID` — serverless endpoint
- `FORGEHUB_STORAGE_DIR` — output/upload storage (default `data/storage`)
- `FORGEHUB_WILDCARD_DIRS` — wildcard dirs (default `./wildcards`)
- `FORGEHUB_CHAT_LLM_URL` / `FORGEHUB_CHAT_LLM_MODEL` / `FORGEHUB_CHAT_LLM_KEY` — optional prompt assist (OpenAI-compatible)
- `FORGEHUB_CHAT_BASE_URL` — optional QwenVL-Mod `/qwenvl/chat` endpoint
- `FORGEHUB_FRONTEND_DIR` — frontend dist served from `/`

See `.env.example` for the full set.

## Frontend

```bash
cd forgehub-app
npm run dev            # Vite dev server
npm run build          # production build (served by the backend)
npm run electron:dev   # Electron desktop in dev
npm run electron:build # dmg/exe via electron-builder
```

The packaged desktop app spawns its own bundled backend on `127.0.0.1:8484` — nothing to configure. In `electron:dev` it loads the Vite dev server, so start the backend too (e.g. `./start.sh`).

## Workflows

JSON files in ComfyUI **API format** (`Export API`), with an optional `.meta.json` for metadata/parameters:

```json
{
  "id": "pony-txt2img",
  "name": "Pony XL Txt2Img",
  "category": "image",
  "description": "Generate images with Pony Diffusion XL",
  "tags": ["pony", "sdxl"],
  "parameters": [],
  "outputs": ["image"]
}
```

Categories: `agent`, `video`, `image`, `audio`, `other`.
