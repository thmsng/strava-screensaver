// Builds the app and assembles release/StravaScreensaver-win64.zip plus the landing page.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

run('node scripts/build.js');
const built = path.join(root, 'dist', 'StravaScreensaver-win32-x64');
const rel = path.join(root, 'release');
const stage = path.join(rel, 'StravaScreensaver');
fs.rmSync(rel, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// The installer creates the .scr itself, so ship only the .exe build.
fs.cpSync(built, path.join(stage, 'app'), { recursive: true, filter: (s) => !s.endsWith('.scr') });
for (const f of fs.readdirSync(path.join(root, 'release-assets'))) fs.copyFileSync(path.join(root, 'release-assets', f), path.join(stage, f));

run('tar -a -c -f StravaScreensaver-win64.zip StravaScreensaver', rel);
fs.rmSync(stage, { recursive: true, force: true });
fs.copyFileSync(path.join(root, 'landing', 'index.html'), path.join(rel, 'index.html'));
const mb = (fs.statSync(path.join(rel, 'StravaScreensaver-win64.zip')).size / 1048576).toFixed(0);
console.log(`\nRelease ready in ${rel} (zip ${mb} MB). Open release/index.html.`);
