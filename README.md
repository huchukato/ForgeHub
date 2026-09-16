# ForgeHub

Frontend hub per orchestrare workflow ComfyUI via chat. Backend Python FastAPI + frontend Electron/React/TypeScript.

## Struttura

- `forgehub_backend/` — API FastAPI che parla con ComfyUI.
- `forgehub-app/` — applicazione desktop Electron.
- `tests/` — test backend.

## Backend

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/python -m forgehub_backend.main
```

Variabili d’ambiente principali:

- `FORGEHUB_HOST` / `FORGEHUB_PORT` — indirizzo del backend (default `0.0.0.0:8484`).
- `COMFYUI_HOST` / `COMFYUI_PORT` — indirizzo ComfyUI (default `localhost:8188`).
- `FORGEHUB_WORKFLOW_DIR` — cartella con i workflow in formato API JSON (default `/workspace/workflows`).
- `COMFYUI_INPUT_DIR` — cartella input di ComfyUI.
- `COMFYUI_OUTPUT_DIR` — cartella output di ComfyUI.

## Frontend

```bash
cd forgehub-app
npm install
npm run dev        # sviluppo con Vite dev server
npm run build      # build produzione
npm run electron:dev   # avvio Electron in dev
```

## Workflow

I workflow devono essere file JSON in formato API ComfyUI. Opzionalmente affiancare un file `.meta.json` con metadati:

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

Categorie supportate: `agent`, `video`, `image`, `audio`, `other`.
