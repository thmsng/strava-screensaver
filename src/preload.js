'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const names = ['status', 'getRuns', 'getSettings', 'saveSettings', 'saveCredentials', 'sync', 'disconnect', 'connect', 'preview', 'quit', 'exportWallpaper', 'openFolder'];
const api = { isElectron: true };
for (const n of names) api[n] = (arg) => ipcRenderer.invoke(n, arg);
contextBridge.exposeInMainWorld('api', api);
