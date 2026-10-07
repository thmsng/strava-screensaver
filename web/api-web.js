// Static wallpaper export (Lively): data.js defines window.__STATIC__, no server involved.
if (!window.api && window.__STATIC__) {
  const S = window.__STATIC__;
  window.api = {
    isElectron: false,
    getSettings: async () => S.settings,
    getRuns: async () => ({ runs: S.runs, athlete: S.athlete, connected: true }),
    quit: () => {},
  };
}
// Fallback API for web mode (node server.js). In Electron the preload script provides window.api instead.
if (!window.api) {
  const call = (name) => async (arg) => {
    const res = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg || {}) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  };
  const api = { isElectron: false };
  for (const n of ['status', 'getRuns', 'getSettings', 'saveSettings', 'saveCredentials', 'sync', 'disconnect']) api[n] = call(n);
  api.connect = async () => {
    const { url } = await call('connect')();
    window.open(url, '_blank');
    // The server finishes the OAuth exchange; poll until it reports connected.
    for (let i = 0; i < 150; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await call('status')();
      if (s.connected) return s;
    }
    throw new Error('Timed out waiting for Strava authorization');
  };
  api.preview = async () => {
    window.open('saver.html', '_blank');
  };
  api.quit = () => {};
  window.api = api;
}
