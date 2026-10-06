import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("forgehub", {
  platform: process.platform,
  backendUrl: "http://127.0.0.1:8484",
  onBackendStatus: (cb: (msg: string) => void) =>
    ipcRenderer.on("backend-status", (_e, msg: string) => cb(msg)),
});
