import { app, BrowserWindow, nativeImage } from "electron";
import fs from "fs";
import path from "path";

const isDev = process.env.NODE_ENV === "development";

function findIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, "..", "..", "build", "icon.icns"),
    path.join(__dirname, "..", "build", "icon.icns"),
    path.join(__dirname, "build", "icon.icns"),
    path.join(process.resourcesPath, "build", "icon.icns"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function createWindow() {
  const iconPath = findIcon();
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
