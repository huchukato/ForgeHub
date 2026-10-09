import { app, BrowserWindow, ipcMain, nativeImage, shell } from "electron";
import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
const BACKEND_URL = "http://127.0.0.1:8484";

let backendProc: ChildProcess | null = null;
let win: BrowserWindow | null = null;

function findIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, "..", "..", "icons", "icon.icns"),
    path.join(process.resourcesPath, "icons", "icon.icns"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function pingBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${BACKEND_URL}/wildcards`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function backendStatus(msg: string) {
  win?.webContents.send("backend-status", msg);
}

async function startBackend(): Promise<void> {
  // Reuse an already-running backend (dev workflow, manual start.sh, or a
  // previous launch that left one behind).
  if (await pingBackend()) {
    backendStatus("Backend already running");
    return;
  }

  const binName = process.platform === "win32" ? "forgehub-backend.exe" : "forgehub-backend";
  const bin = path.join(process.resourcesPath, binName);
  if (!fs.existsSync(bin)) {
    backendStatus(`Backend binary not found: ${bin}`);
    return;
  }

  const userData = app.getPath("userData");
  fs.mkdirSync(userData, { recursive: true });
  const logFd = fs.openSync(path.join(userData, "forgehub-backend.log"), "a");

  backendStatus("Starting backend…");
  backendProc = spawn(bin, [], {
    env: {
      ...process.env,
      FORGEHUB_HOST: "127.0.0.1",
      FORGEHUB_PORT: "8484",
      FORGEHUB_STORAGE_DIR: path.join(userData, "storage"),
      FORGEHUB_SETTINGS_FILE: path.join(userData, "settings.json"),
      FORGEHUB_WORKFLOW_DIR: path.join(process.resourcesPath, "workflows"),
      FORGEHUB_WILDCARD_DIRS: path.join(process.resourcesPath, "wildcards"),
      FORGEHUB_FRONTEND_DIR: "",
    },
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  backendProc.on("exit", (code) => {
    backendProc = null;
    backendStatus(`Backend exited (code ${code})`);
  });

  // Onefile binaries unpack to a temp dir first — allow up to 60s.
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!backendProc) {
      backendStatus("Backend failed to start — see forgehub-backend.log");
      return;
    }
    if (await pingBackend()) {
      backendStatus("Backend ready");
      return;
    }
    if (i % 10 === 9) backendStatus("Still starting…");
  }
  backendStatus("Backend is taking too long — see forgehub-backend.log");
}

function createWindow() {
  const iconPath = findIcon();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon,
    // NOTE: hiddenInset on macOS 26 makes the whole window swallow left-clicks
    // (movableByWindowBackground bug). Default chrome until upstream fix.
    // titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
    return;
  }

  // Production: splash with progress while the bundled backend boots,
  // then swap in the real UI.
  win.loadFile(path.join(__dirname, "..", "..", "splash.html"));
  startBackend().finally(() => {
    win?.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  });
}

async function checkForUpdates() {
  try {
    const res = await fetch("https://api.github.com/repos/huchukato/ForgeHub/releases/latest", {
      headers: { "User-Agent": "ForgeHub" },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const rel = await res.json();
    const latest = String(rel.tag_name ?? "").replace(/^v/, "");
    const current = app.getVersion();
    const newer = (() => {
      const a = latest.split(".").map(Number);
      const b = current.split(".").map(Number);
      for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
      return false;
    })();
    if (!latest || !newer) return { upToDate: true, current, latest };
    const pick = (re: RegExp) =>
      (rel.assets ?? []).find((a: { name: string }) => re.test(a.name))?.browser_download_url;
    const downloadUrl =
      process.platform === "darwin" ? pick(/\.dmg$/)
      : process.platform === "win32" ? pick(/\.exe$/)
      : pick(/\.AppImage$/) ?? pick(/\.deb$/);
    return {
      upToDate: false,
      current,
      latest,
      releaseUrl: rel.html_url,
      downloadUrl,
      notes: String(rel.body ?? "").slice(0, 600),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

ipcMain.handle("update:check", checkForUpdates);
ipcMain.on("update:open", (_e, url) => {
  if (typeof url === "string" && url.startsWith("https://")) shell.openExternal(url);
});

app.whenReady().then(createWindow);

app.on("will-quit", () => {
  backendProc?.kill();
  backendProc = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
