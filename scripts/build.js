// Packages the Electron app and produces dist/StravaScreensaver-win32-x64/StravaScreensaver.scr
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

run('node scripts/copy-vendor.js');
run('npx electron-packager . StravaScreensaver --platform=win32 --arch=x64 --out=dist --overwrite --prune=true --ignore="^/dist" --ignore="^/scripts" --ignore="^/release" --ignore="^/landing" --ignore="^/release-assets" ');

const dir = path.join(root, 'dist', 'StravaScreensaver-win32-x64');
fs.copyFileSync(path.join(dir, 'StravaScreensaver.exe'), path.join(dir, 'StravaScreensaver.scr'));
console.log('\nBuilt: ' + path.join(dir, 'StravaScreensaver.scr'));
console.log('Install with: powershell -ExecutionPolicy Bypass -File scripts/install.ps1');
