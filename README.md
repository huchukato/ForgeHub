# ForgeHub

![ForgeHub](img/banner.jpeg)

Frontend per orchestrare workflow ComfyUI — su ComfyUI locale o su endpoint Runpod Serverless. Backend Python FastAPI + frontend React/TypeScript (web o Electron).

Companion dei worker: [runpod-qwen21](https://github.com/huchukato/runpod-qwen21) (Qwen Image 2.1 T2I/Edit + Pony) · [runpod-minimax-h3](https://github.com/huchukato/runpod-minimax-h3) (MiniMax H3 video+audio)

## Quick start

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

Lo script fa tutto da solo: installa **uv** se manca, crea `.venv` e installa il backend (`pip install -e .`), `npm install` + build del frontend, poi avvia su **http://127.0.0.1:8484**. Al primo giro copia `.env.example` → `.env`: compilalo (Runpod API key + endpoint id) e rilancia.

Opzioni: `./start.sh --build` forza il rebuild del frontend · `./start.sh --dev` avvia backend + Vite dev server (:5173, hot reload).

Prerequisiti: solo **Node.js** (per il build del frontend) — il resto è gestito da uv.

## Modalità di esecuzione

| `FORGEHUB_EXECUTION_MODE` | Cosa fa |
| --- | --- |
| `serverless` | Job → `api.runpod.ai/v2/{endpoint}/run`, output in base64 → `data/storage`, serviti da `/outputs/` |
| `direct` | Job → ComfyUI locale (`COMFYUI_HOST:PORT`, default `localhost:8188`) |

Wildcard expansion (`__pmp/…__`) e select a runtime lato backend — la directory `wildcards/` è bundled; override con `FORGEHUB_WILDCARD_DIRS` (colon-separated).

## Variabili d'ambiente

- `FORGEHUB_HOST` / `FORGEHUB_PORT` — bind backend (default `0.0.0.0:8484`)
- `RUNPOD_API_KEY` / `RUNPOD_ENDPOINT_ID` — endpoint serverless
- `COMFYUI_HOST` / `COMFYUI_PORT` — ComfyUI per la modalità direct
- `FORGEHUB_STORAGE_DIR` — storage output/upload (default `data/storage`)
- `FORGEHUB_WILDCARD_DIRS` — dir wildcard (default `./wildcards`)
- `FORGEHUB_CHAT_BASE_URL` — chat opzionale (`/qwenvl/chat` di QwenVL-Mod)
- `FORGEHUB_FRONTEND_DIR` — dist frontend servita da `/`

Vedi `.env.example` per il set completo.

## Frontend

```bash
cd forgehub-app
npm run dev            # Vite dev server
npm run build          # build produzione (servita dal backend)
npm run electron:dev   # desktop Electron in dev
npm run electron:build # dmg/exe via electron-builder
```

L'app desktop prende il backend URL da Settings (`forgehub.backend`) — punta a un backend locale o remoto.

## Workflow

File JSON in formato **API ComfyUI** (`Export API`), con `.meta.json` opzionale per metadati/parametri:

```json
{
  "id": "pony-txt2img",
  "name": "Pony XL Txt2Img",
  "category": "image",
  "description": "Genera immagini con Pony Diffusion XL",
  "tags": ["pony", "sdxl"],
  "parameters": [],
  "outputs": ["image"]
}
```

Categorie: `agent`, `video`, `image`, `audio`, `other`.
