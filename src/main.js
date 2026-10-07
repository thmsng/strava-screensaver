'use strict';
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('path');
const Core = require('./core');

// Windows screensaver protocol: /s run, /c configure, /p <hwnd> preview. No argument means configure.
// /w and /e are ours: /w headless web server, /e export the static wallpaper folder and exit.
const args = process.argv.slice(app.isPackaged ? 1 : 2).map((a) => a.toLowerCase());
const flag = args.find((a) => /^[/-][scpwe](:|$)/.test(a)) || '-c';
const mode = flag[1];
if (mode === 'w' || mode === 'e') app.disableHardwareAcceleration(); // headless server, no GPU needed
const windowed = args.includes('--windowed');

const WEB = path.join(__dirname, '..', 'web');
const saverWindows = new Set();
let settingsWindow = null;
let core;

function webPrefs() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false };
}

function openSaver() {
  const displays = windowed ? [screen.getPrimaryDisplay()] : screen.getAllDisplays();
  for (const d of displays) {
    const b = d.bounds;
    const win = new BrowserWindow({
      x: windowed ? b.x + 60 : b.x,
      y: windowed ? b.y + 60 : b.y,
      width: windowed ? 1280 : b.width,
      height: windowed ? 720 : b.height,
      frame: !!windowed,
      fullscreen: !windowed,
      skipTaskbar: !windowed,
      backgroundColor: '#000000',
      show: false,
      webPreferences: webPrefs(),
    });
    if (!windowed) win.setAlwaysOnTop(true, 'screen-saver');
    win.setMenuBarVisibility(false);
    win.loadFile(path.join(WEB, 'saver.html'), { query: { exit: windowed ? '0' : '1' } });
    win.once('ready-to-show', () => win.show());
    saverWindows.add(win);
    win.on('closed', () => saverWindows.delete(win));
  }
}

function openSettings() {
  if (settingsWindow) return settingsWindow.focus();
  settingsWindow = new BrowserWindow({
    width: 760,
    height: 860,
    title: 'Strava Screensaver',
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    webPreferences: webPrefs(),
  });
  settingsWindow.loadFile(path.join(WEB, 'settings.html'));
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function registerIpc() {
  for (const [name, fn] of Object.entries(core.api())) ipcMain.handle(name, (_e, arg) => fn(arg));
  ipcMain.handle('connect', async () => {
    const { url, done } = await core.beginAuth();
    shell.openExternal(url);
    await done;
    core.sync(true);
    return core.status();
  });
  ipcMain.handle('openFolder', (_e, p) => shell.openPath(p));
  ipcMain.handle('preview', () => {
    openSaver();
  });
  ipcMain.handle('quit', () => {
    for (const w of [...saverWindows]) w.close();
    if (mode === 's') app.quit();
  });
}

app.whenReady().then(() => {
  core = new Core(app.getPath('userData'));
  registerIpc();
  if (mode === 'e') {
    // Quick headless refresh: sync new runs (if connected and online), rewrite the wallpaper folder, exit.
    (async () => {
      try { if (core.status().connected) await core.sync(false); } catch {}
      try { console.log(core.exportWallpaper().index); } catch (e) { console.error(e.message); }
      app.quit();
    })();
    return;
  }
  if (mode === 'w') {
    // Headless wallpaper server for Lively Wallpaper (http://localhost:8765/wallpaper.html).
    require('../server').start(core, 8765, () => app.quit());
    return;
  }
  if (mode === 'p') return app.quit(); // The tiny settings-dialog preview is not supported.
  if (mode === 's') openSaver();
  else openSettings();
});

app.on('window-all-closed', () => app.quit());
