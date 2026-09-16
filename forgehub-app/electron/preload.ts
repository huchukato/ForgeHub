import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("forgehub", {
  platform: process.platform,
});
