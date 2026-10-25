import { contextBridge, ipcRenderer } from "electron";
import { APP_INFO } from "./appInfo.js";
import type { HardwareAPI } from "./types.js";

const api: HardwareAPI = {
  platform: process.platform,
  info: APP_INFO,
  bootstrap: () => ipcRenderer.invoke("hardware:bootstrap"),
  pause: (value) => ipcRenderer.invoke("hardware:pause", value),
  interval: (value) => ipcRenderer.invoke("hardware:interval", value),
  copy: (report) => ipcRenderer.invoke("hardware:copy", report),
  onSettings: (callback) => ipcRenderer.on("hardware:settings", (_, data) => callback(data)),
  onSample: (callback) => ipcRenderer.on("hardware:sample", (_, data) => callback(data)),
  onInventory: (callback) => ipcRenderer.on("hardware:inventory", (_, data) => callback(data)),
};

contextBridge.exposeInMainWorld("hardware", api);
