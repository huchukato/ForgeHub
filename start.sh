#!/usr/bin/env bash
# ForgeHub launcher: sets up the Python env (uv), builds the frontend if
# needed, then starts the backend which serves both the API and the GUI on
# FORGEHUB_PORT (default 8484).
# Usage:
#   ./start.sh           → setup if needed, build if stale, start backend
#   ./start.sh --build   → force frontend rebuild, then start
#   ./start.sh --dev     → backend + vite dev server (port 5173, hot reload)
set -euo pipefail
cd "$(dirname "$0")"

APP_DIR="forgehub-app"
DIST_DIR="$APP_DIR/dist"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

# ── uv (package/env manager — fast and consistent) ────────────────────────────
if ! command -v uv >/dev/null 2>&1; then
    echo "▶ uv non trovato — installo (astral.sh)…"
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

# ── Python env ────────────────────────────────────────────────────────────────
if [ ! -x .venv/bin/python ]; then
    echo "▶ Creo .venv e installo il backend (uv)…"
    uv venv .venv
    uv pip install -e . --python .venv/bin/python
fi

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "⚠️  .env mancante — copio da .env.example, compilalo e rilancia."
    cp .env.example .env
    exit 1
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
DEV=0
FORCE_BUILD=0
for arg in "$@"; do
    case "$arg" in
        --dev) DEV=1 ;;
        --build) FORCE_BUILD=1 ;;
    esac
done

if [ "$DEV" -eq 0 ]; then
    if ! command -v npm >/dev/null 2>&1; then
        echo "❌ npm non trovato — installa Node.js (https://nodejs.org) e rilancia." >&2
        exit 1
    fi
    if [ ! -d "$APP_DIR/node_modules" ]; then
        echo "▶ npm install…"
        (cd "$APP_DIR" && npm install)
    fi
    # Stale check: rebuild if dist missing or any src file is newer than index.html
    if [ "$FORCE_BUILD" -eq 1 ] || [ ! -f "$DIST_DIR/index.html" ] || \
       [ -n "$(find "$APP_DIR/src" -newer "$DIST_DIR/index.html" -print -quit 2>/dev/null)" ]; then
        echo "▶ Building frontend…"
        (cd "$APP_DIR" && npm run build)
    fi
    echo "▶ ForgeHub → http://127.0.0.1:${FORGEHUB_PORT:-8484}"
    exec .venv/bin/python -m forgehub_backend.main
else
    echo "▶ Dev mode: backend su :${FORGEHUB_PORT:-8484} + vite su :5173"
    .venv/bin/python -m forgehub_backend.main &
    BACKEND_PID=$!
    trap 'kill $BACKEND_PID 2>/dev/null' EXIT
    (cd "$APP_DIR" && npm run dev)
fi
