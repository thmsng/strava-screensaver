const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');
const dst = path.join(__dirname, '..', 'web', 'vendor');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['leaflet.js', 'leaflet.css']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
console.log('Copied Leaflet to web/vendor');
