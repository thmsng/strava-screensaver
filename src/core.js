'use strict';
// Strava access, local storage and settings. Shared by the Electron app and the web server.
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;
const RUN_TYPES = new Set(['Run', 'TrailRun']);

const DEFAULT_SETTINGS = {
  units: 'km',
  colorMode: 'distance', // distance | year | pace | type | cycle
  mapStyle: 'dark', // dark | darknolabels | satellite | terrain
  runnersPerArea: 8,
  speed: 1,
  areaSeconds: 25,
  showStats: true,
  showCaptions: true,
  showLegend: true,
};

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;background:#0b0f14;color:#e8eef5;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${title}</h2><p>${body}</p></div>`;

class Core {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.cfgFile = path.join(dir, 'config.json');
    this.cacheFile = path.join(dir, 'activities.json');
    this.cfg = this._read(this.cfgFile, {});
    this.cache = this._read(this.cacheFile, { runs: [], syncedAt: 0 });
    this._mtimes = {};
    this.syncing = null;
    this.lastError = null;
    this.authServer = null;
  }

  _read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  // Another process (settings window, wallpaper server) may have changed the files; pick that up.
  _reload() {
    for (const [file, key, fallback] of [[this.cfgFile, 'cfg', {}], [this.cacheFile, 'cache', { runs: [], syncedAt: 0 }]]) {
      try {
        const m = fs.statSync(file).mtimeMs;
        if (m !== this._mtimes[file]) {
          this._mtimes[file] = m;
          this[key] = this._read(file, fallback);
        }
      } catch {}
    }
  }

  _write(file, obj) {
    fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
    fs.renameSync(file + '.tmp', file);
    try { this._mtimes[file] = fs.statSync(file).mtimeMs; } catch {}
  }

  _saveCfg() {
    this._write(this.cfgFile, this.cfg);
  }

  // ---- settings ----
  getSettings() {
    this._reload();
    return { ...DEFAULT_SETTINGS, ...(this.cfg.settings || {}) };
  }

  saveSettings(s) {
    const clean = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in s) clean[k] = s[k];
    this.cfg.settings = { ...this.getSettings(), ...clean };
    this._saveCfg();
    this._refreshExport();
    return this.getSettings();
  }

  // ---- credentials / auth ----
  saveCredentials({ clientId, clientSecret }) {
    clientId = String(clientId || '').trim();
    clientSecret = String(clientSecret || '').trim();
    if (!/^\d+$/.test(clientId)) throw new Error('Client ID should be a number');
    if (!clientSecret) throw new Error('Client secret is required');
    if (clientId !== this.cfg.clientId) {
      delete this.cfg.tokens;
      delete this.cfg.athlete;
    }
    this.cfg.clientId = clientId;
    this.cfg.clientSecret = clientSecret;
    this._saveCfg();
    return this.status();
  }

  status() {
    this._reload();
    return {
      hasCredentials: !!(this.cfg.clientId && this.cfg.clientSecret),
      clientId: this.cfg.clientId || '',
      connected: !!this.cfg.tokens,
      athlete: this.cfg.athlete || null,
      runCount: this.cache.runs.length,
      syncedAt: this.cache.syncedAt,
      syncing: !!this.syncing,
      error: this.lastError,
      redirect: REDIRECT,
    };
  }

  authUrl() {
    const q = new URLSearchParams({
      client_id: this.cfg.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT,
      approval_prompt: 'auto',
      scope: 'read,activity:read_all',
    });
    return `https://www.strava.com/oauth/authorize?${q}`;
  }

  async _tokenRequest(params) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `Strava token request failed (${res.status})`);
    return body;
  }

  // Starts a one-shot loopback server for the OAuth redirect. Returns the URL to open and a promise for completion.
  async beginAuth() {
    if (!this.status().hasCredentials) throw new Error('Save your client ID and secret first');
    if (this.authServer) this.authServer.close();
    const srv = http.createServer();
    this.authServer = srv;
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for Strava authorization')), 5 * 60e3);
      srv.on('request', async (req, resp) => {
        const u = new URL(req.url, REDIRECT);
        if (u.pathname !== '/callback') {
          resp.statusCode = 404;
          return resp.end();
        }
        resp.setHeader('Content-Type', 'text/html; charset=utf-8');
        try {
          if (u.searchParams.get('error')) throw new Error('Authorization was denied');
          const scope = u.searchParams.get('scope') || '';
          if (!scope.includes('activity:read')) throw new Error('Please allow access to your activities');
          const t = await this._tokenRequest({ code: u.searchParams.get('code'), grant_type: 'authorization_code' });
          this.cfg.tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
          this.cfg.athlete = { name: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(' ') };
          this.lastError = null;
          this._saveCfg();
          resp.end(page('Connected to Strava', 'You can close this tab and go back to the app.'));
          clearTimeout(timer);
          resolve();
        } catch (e) {
          resp.end(page('Could not connect', e.message));
          clearTimeout(timer);
          reject(e);
        }
      });
    });
    done.catch(() => {}).finally(() => {
      srv.close();
      if (this.authServer === srv) this.authServer = null;
    });
    await new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(PORT, '127.0.0.1', resolve);
    });
    return { url: this.authUrl(), done };
  }

  disconnect() {
    delete this.cfg.tokens;
    delete this.cfg.athlete;
    this._saveCfg();
    this.cache = { runs: [], syncedAt: 0 };
    this._write(this.cacheFile, this.cache);
    return this.status();
  }

  async _accessToken() {
    const t = this.cfg.tokens;
    if (!t) throw new Error('Not connected to Strava');
    if (t.expires_at - 60 > Date.now() / 1000) return t.access_token;
    const r = await this._tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    this.cfg.tokens = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at };
    this._saveCfg();
    return r.access_token;
  }

  // ---- activities ----
  sync(full = false) {
    if (this.syncing) return this.syncing;
    this.syncing = this._sync(full)
      .then(() => {
        this.lastError = null;
      })
      .catch((e) => {
        this.lastError = e.message;
        throw e;
      })
      .finally(() => {
        this.syncing = null;
      });
    this.syncing.catch(() => {});
    return this.syncing;
  }

  async _sync(full) {
    const known = full ? [] : this.cache.runs;
    const newest = known.reduce((m, r) => Math.max(m, r.t), 0);
    // Re-check two days back so edited activities are picked up.
    const after = newest ? newest - 2 * 86400 : 0;
    const byId = new Map(known.map((r) => [r.id, r]));
    for (let pageNo = 1; ; pageNo++) {
      const token = await this._accessToken();
      const url = `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${pageNo}${after ? `&after=${after}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) throw new Error('Strava rate limit reached, try again in 15 minutes');
      if (res.status === 401) throw new Error('Strava rejected the token. Disconnect and connect again.');
      if (!res.ok) throw new Error(`Strava returned ${res.status}`);
      const items = await res.json();
      if (!items.length) break;
      for (const a of items) {
        const type = a.sport_type || a.type;
        const poly = a.map && a.map.summary_polyline;
        if (!RUN_TYPES.has(type) || !poly) continue;
        byId.set(a.id, {
          id: a.id,
          name: a.name,
          start: a.start_date_local,
          t: Math.floor(new Date(a.start_date).getTime() / 1000),
          dist: a.distance,
          time: a.moving_time,
          elev: a.total_elevation_gain || 0,
          type,
          poly,
        });
      }
      if (items.length < 200) break;
    }
    this.cache = { runs: [...byId.values()].sort((a, b) => a.t - b.t), syncedAt: Date.now() };
    this._write(this.cacheFile, this.cache);
    this._refreshExport();
  }

  getRuns({ autoSync = false } = {}) {
    this._reload();
    const stale = Date.now() - this.cache.syncedAt > 12 * 3600e3;
    if (autoSync && this.cfg.tokens && stale) this.sync(false);
    return { runs: this.cache.runs, athlete: this.cfg.athlete || null, connected: !!this.cfg.tokens };
  }

  // ---- static wallpaper export (for Lively: a local folder, no server needed) ----
  wallpaperDir() {
    return path.join(this.dir, 'wallpaper');
  }

  exportWallpaper() {
    this._reload();
    const web = path.join(__dirname, '..', 'web');
    const out = this.wallpaperDir();
    fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
    // Plain read/write (not cpSync) so this also works from inside the packaged asar.
    for (const f of ['saver.js', 'saver.css', 'api-web.js', 'vendor/leaflet.js', 'vendor/leaflet.css']) {
      fs.writeFileSync(path.join(out, f), fs.readFileSync(path.join(web, f)));
    }
    const html = fs
      .readFileSync(path.join(web, 'saver.html'), 'utf8')
      .replace('<script src="vendor/leaflet.js"></script>', '<script>window.__WALLPAPER__ = 1;</script>\n<script src="data.js"></script>\n<script src="vendor/leaflet.js"></script>');
    fs.writeFileSync(path.join(out, 'index.html'), html);
    const snapshot = { runs: this.cache.runs, settings: this.getSettings(), athlete: this.cfg.athlete || null, exportedAt: Date.now() };
    fs.writeFileSync(path.join(out, 'data.js'), 'window.__STATIC__ = ' + JSON.stringify(snapshot) + ';');
    return { path: out, index: path.join(out, 'index.html'), count: this.cache.runs.length };
  }

  // Keep an existing export up to date after syncs and setting changes.
  _refreshExport() {
    try {
      if (fs.existsSync(path.join(this.wallpaperDir(), 'index.html'))) this.exportWallpaper();
    } catch {}
  }

  // Calls shared by the Electron IPC layer and the web server.
  api() {
    return {
      status: () => this.status(),
      getRuns: (o) => this.getRuns(o),
      getSettings: () => this.getSettings(),
      saveSettings: (s) => this.saveSettings(s),
      saveCredentials: (c) => this.saveCredentials(c),
      sync: async (full) => {
        await this.sync(!!full).catch(() => {});
        return this.status();
      },
      disconnect: () => this.disconnect(),
      exportWallpaper: () => this.exportWallpaper(),
    };
  }
}

module.exports = Core;
