@echo off
REM ForgeHub launcher (Windows): sets up the Python env via uv, builds the
REM frontend if needed, then starts the backend (API + GUI on FORGEHUB_PORT,
REM default 8484).
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "APP_DIR=forgehub-app"
set "DIST_DIR=%APP_DIR%\dist"
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%PATH%"

REM ── uv ──
where uv >nul 2>&1
if errorlevel 1 (
    echo [*] uv non trovato - installo (astral.sh)...
    powershell -ExecutionPolicy Bypass -c "irm https://astral.sh/uv/install.ps1 | iex"
    set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%PATH%"
)

REM ── Python env ──
if not exist ".venv\Scripts\python.exe" (
    echo [*] Creo .venv e installo il backend (uv)...
    uv venv .venv || exit /b 1
    uv pip install -e . --python .venv\Scripts\python.exe || exit /b 1
)

REM ── .env ──
if not exist ".env" (
    echo [!] .env mancante - copio da .env.example, compilalo e rilancia.
    copy .env.example .env >nul
    exit /b 1
)

REM ── Frontend ──
if /i "%~1"=="--dev" goto :dev

where npm >nul 2>&1
if errorlevel 1 (
    echo [x] npm non trovato - installa Node.js (https://nodejs.org) e rilancia.
    exit /b 1
)
if not exist "%APP_DIR%\node_modules" (
    echo [*] npm install...
    pushd %APP_DIR% && call npm install && popd || exit /b 1
)
if /i "%~1"=="--build" goto :build
if not exist "%DIST_DIR%\index.html" goto :build
REM dist exists - skip stale check (cheap on Windows); use --build to force
goto :serve

:build
echo [*] Building frontend...
pushd %APP_DIR% && call npm run build && popd || exit /b 1

:serve
echo [*] ForgeHub -^> http://127.0.0.1:8484
.venv\Scripts\python.exe -m forgehub_backend.main
exit /b 0

:dev
echo [*] Dev mode: backend su :8484 + vite su :5173
start "forgehub-backend" .venv\Scripts\python.exe -m forgehub_backend.main
pushd %APP_DIR% && call npm run dev && popd
exit /b 0
