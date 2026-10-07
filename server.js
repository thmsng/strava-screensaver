'use strict';
// Web mode: `node server.js`, or the packaged app with /w. Serves http://localhost:8765 (settings, saver, wallpaper).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Core = require('./src/core');

const WEB = path.join(__dirname, 'web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function readJson(req) {
  let s = '';
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}

function start(core, port, onError) {
  const api = core.api();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);
    if (u.pathname.startsWith('/api/')) {
      const name = u.pathname.slice(5);
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      try {
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        const body = await readJson(req);
        if (name === 'connect') {
          const { url, done } = await core.beginAuth();
          done.then(() => core.sync(true)).catch(() => {});
          return send(200, { url });
        }
        if (!api[name]) return send(404, { error: 'Unknown call' });
        return send(200, (await api[name](body)) ?? {});
      } catch (e) {
        return send(400, { error: e.message });
      }
    }
    const rel = u.pathname === '/' ? '/settings.html' : decodeURIComponent(u.pathname);
    const file = path.normalize(path.join(WEB, rel));
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  server.on('error', (e) => (onError ? onError(e) : console.error(e.message)));
  server.listen(port, '127.0.0.1', () => console.log(`Strava screensaver (web mode): http://localhost:${port}`));
  return server;
}

// Share data with the desktop screensaver when it has already been set up.
function electronDir() {
  const d = path.join(process.env.APPDATA || '', 'strava-screensaver');
  return fs.existsSync(path.join(d, 'config.json')) ? d : null;
}

module.exports = { start };

if (require.main === module) {
  const dir = process.env.STRAVA_SAVER_DIR || electronDir() || path.join(os.homedir(), '.strava-screensaver');
  start(new Core(dir), Number(process.env.PORT) || 8765);
}
