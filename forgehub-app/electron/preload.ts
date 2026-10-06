import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("forgehub", {
  platform: process.platform,
  onBackendStatus: (cb: (msg: string) => void) =>
    ipcRenderer.on("backend-status", (_e, msg: string) => cb(msg)),
});
