// Safe renderer <-> main bridge (no require in the renderer).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('loader', {
  connect: (host, port) => ipcRenderer.invoke('connect', { host, port }),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  pickBin: () => ipcRenderer.invoke('pick-bin'),
  sendRegion: (file, start, mode) => ipcRenderer.invoke('send-region', { file, start, mode }),
  clearRegion: (start, len) => ipcRenderer.invoke('clear-region', { start, len }),
  setMode: (start, len, mode) => ipcRenderer.invoke('set-mode', { start, len, mode }),
  listRegions: () => ipcRenderer.invoke('list-regions'),
  sendBank: (b) => ipcRenderer.invoke('send-bank', b),
  clearBank: (win) => ipcRenderer.invoke('clear-bank', { win }),
  bankState: () => ipcRenderer.invoke('bank-state'),
  memRead: (id, addr, len, src) => ipcRenderer.invoke('mem-read', { id, addr, len, src }),
  termConnect: (host, port) => ipcRenderer.invoke('term-connect', { host, port }),
  termDisconnect: () => ipcRenderer.invoke('term-disconnect'),
  termSend: (line) => ipcRenderer.invoke('term-send', line),
  onTermData: (cb) => ipcRenderer.on('term-data', (_e, t) => cb(t)),
  onTermStatus: (cb) => ipcRenderer.on('term-status', (_e, s) => cb(s)),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  onStatus: (cb) => ipcRenderer.on('status', (_e, s) => cb(s)),
  onFrame: (cb) => ipcRenderer.on('frame', (_e, f) => cb(f)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
});
