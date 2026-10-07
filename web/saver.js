'use strict';
(async function () {
  const qs = new URLSearchParams(location.search);
  const api = window.api;
  const $ = (id) => document.getElementById(id);

  // ---------- leave on input (real screensaver mode only) ----------
  if (qs.get('exit') === '1') {
    const t0 = Date.now();
    let lx = null, ly = null;
    const quit = () => api.quit();
    addEventListener('keydown', quit);
    addEventListener('mousedown', quit);
    addEventListener('wheel', quit);
    addEventListener('mousemove', (e) => {
      if (lx === null || Date.now() - t0 < 1500) { lx = e.screenX; ly = e.screenY; return; }
      if (Math.hypot(e.screenX - lx, e.screenY - ly) > 8) quit();
    });
  } else {
    addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (document.fullscreenElement) document.exitFullscreen(); else api.quit(); } });
    addEventListener('click', () => { if (!WALLPAPER && !api.isElectron && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); });
  }
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});

  // ---------- data ----------
  const settings = await api.getSettings();
  const WALLPAPER = qs.get('wallpaper') === '1' || !!window.__WALLPAPER__;
  if (WALLPAPER) {
    // Calmer variant for use behind desktop icons; HUD moves to the right so icons stay clear.
    Object.assign(settings, { speed: settings.speed * 0.6, areaSeconds: Math.max(settings.areaSeconds, 40) });
    document.body.classList.add('wallpaper');
  }
  const data = await api.getRuns({ autoSync: true });
  let runs = data.runs;
  if (!runs.length && qs.get('demo') === '1') runs = demoRuns();

  const msg = $('msg');
  if (!runs.length) {
    msg.style.display = 'grid';
    msg.innerHTML = data.connected
      ? 'Syncing your runs from Strava…<small>This takes a few seconds the first time. Move the mouse and relaunch shortly.</small>'
      : 'No runs to show yet<small>Open the settings (run the .scr with /c, or <a href="settings.html">settings.html</a> in web mode) and connect Strava.</small>';
    if (data.connected) setTimeout(() => location.reload(), 8000);
    return;
  }

  // ---------- run preparation ----------
  const M_PER_DEG = 111320;
  function decode(str) {
    const out = [];
    let i = 0, lat = 0, lng = 0;
    while (i < str.length) {
      for (let k = 0; k < 2; k++) {
        let b, shift = 0, res = 0;
        do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
        const d = res & 1 ? ~(res >> 1) : res >> 1;
        if (k === 0) lat += d; else lng += d;
      }
      out.push([lat / 1e5, lng / 1e5]);
    }
    return out;
  }
  function prep(r) {
    const pts = r.pts || decode(r.poly);
    const cum = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) {
      const dy = (pts[i][0] - pts[i - 1][0]) * M_PER_DEG;
      const dx = (pts[i][1] - pts[i - 1][1]) * M_PER_DEG * Math.cos((pts[i][0] * Math.PI) / 180);
      cum[i] = cum[i - 1] + Math.hypot(dx, dy);
    }
    return { ...r, pts, cum, total: cum[pts.length - 1] || 1, year: +r.start.slice(0, 4), speed: r.dist / Math.max(r.time, 1) };
  }
  runs = runs.map(prep).filter((r) => r.pts.length > 3);

  const sortedDist = runs.map((r) => r.dist).sort((a, b) => a - b);
  const sortedSpeed = runs.map((r) => r.speed).sort((a, b) => a - b);
  const years = [...new Set(runs.map((r) => r.year))].sort();
  const rank = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(arr.length - 1, 1); };

  // ---------- units / formatting ----------
  const mi = settings.units === 'mi';
  const u = mi ? 1609.344 : 1000;
  const unit = mi ? 'mi' : 'km';
  const fmtDist = (m) => (m / u).toFixed(m / u >= 100 ? 0 : 1) + ' ' + unit;
  const fmtPace = (r) => { const s = Math.round(u / r.speed); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /${unit}`; };
  const fmtDate = (r) => new Date(r.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const nf = (n) => Math.round(n).toLocaleString();

  // ---------- colour modes ----------
  const heat = (t) => `hsl(${Math.round(220 - 220 * t)} 95% 60%)`;
  const yearColor = (y) => `hsl(${(265 + years.indexOf(y) * (320 / Math.max(years.length, 1))) % 360} 90% 62%)`;
  const MODES = {
    distance: { name: 'Distance', color: (r) => heat(rank(sortedDist, r.dist)), legend: () => gradient(`${fmtDist(sortedDist[0])}`, `${fmtDist(sortedDist[sortedDist.length - 1])}`) },
    pace: { name: 'Pace (slow to fast)', color: (r) => heat(rank(sortedSpeed, r.speed)), legend: () => gradient('slower', 'faster') },
    year: { name: 'Year', color: (r) => yearColor(r.year), legend: () => chips(years.map((y) => [yearColor(y), y])) },
    type: { name: 'Type', color: (r) => (r.type === 'TrailRun' ? 'hsl(30 95% 58%)' : 'hsl(190 95% 58%)'), legend: () => chips([['hsl(190 95% 58%)', 'Road'], ['hsl(30 95% 58%)', 'Trail']]) },
  };
  const gradient = (a, b) => `<div class="bar" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(heat).join(',')})"></div><div class="ends"><span>${a}</span><span>${b}</span></div>`;
  const chips = (list) => `<div class="chips">${list.map(([c, t]) => `<span style="--c:${c}">${t}</span>`).join('')}</div>`;
  const cycle = ['distance', 'year', 'pace', 'type'];
  let modeIdx = 0, modeSince = performance.now();
  const modeKey = () => (settings.colorMode === 'cycle' ? cycle[modeIdx] : MODES[settings.colorMode] ? settings.colorMode : 'distance');

  // ---------- map ----------
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const STYLES = {
    dark: { url: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', labels: ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles © Esri', sub: 'abc', max: 16 },
    darknolabels: { url: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles © Esri', sub: 'abc', max: 16 },
    satellite: { url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagery © Esri', sub: 'abc', max: 18 },
    terrain: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap © OpenTopoMap', sub: 'abc', max: 17 },
  };
  const style = STYLES[settings.mapStyle] || STYLES.dark;
  document.body.classList.add('style-' + (STYLES[settings.mapStyle] ? settings.mapStyle : 'dark'));
  const map = L.map('map', {
    zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
    keyboard: false, touchZoom: false, zoomSnap: 0, fadeAnimation: true, attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  window.__map = map;
  L.tileLayer(style.url, { attribution: style.attr, subdomains: style.sub, maxZoom: style.max, keepBuffer: 4 }).addTo(map);
  if (style.labels) L.tileLayer(style.labels, { subdomains: style.sub, maxZoom: style.max, keepBuffer: 4, opacity: 0.8 }).addTo(map);
  map.setView([runs[0].pts[0][0], runs[0].pts[0][1]], 12, { animate: false });

  // ---------- canvas ----------
  const canvas = $('fx');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    map.invalidateSize();
  }
  addEventListener('resize', resize);
  resize();

  // ---------- stats ticker ----------
  const thisYear = new Date().getFullYear();
  const totalDist = runs.reduce((s, r) => s + r.dist, 0);
  const longest = runs.reduce((a, b) => (b.dist > a.dist ? b : a));
  const statItems = [
    [nf(runs.length), 'runs recorded'],
    [fmtDist(totalDist), 'total distance'],
    [fmtDist(runs.filter((r) => r.year === thisYear).reduce((s, r) => s + r.dist, 0)), `distance in ${thisYear}`],
    [`${nf(runs.reduce((s, r) => s + r.time, 0) / 3600)} h`, 'time on your feet'],
    [fmtDist(longest.dist), `longest run, ${fmtDate(longest)}`],
    [`${nf(runs.reduce((s, r) => s + r.elev, 0))} m`, 'total climbed'],
    [`${years[0]} – ${years[years.length - 1]}`, `${years.length} years of running`],
  ];
  const statsEl = $('stats');
  if (!settings.showStats) statsEl.style.display = 'none';
  let statIdx = 0;
  function showStat() {
    statsEl.classList.add('hide');
    setTimeout(() => {
      const [big, small] = statItems[statIdx++ % statItems.length];
      statsEl.querySelector('.big').textContent = big;
      statsEl.querySelector('.small').textContent = small;
      statsEl.classList.remove('hide');
    }, 800);
  }
  showStat();
  setInterval(showStat, 7000);

  // ---------- area choreography ----------
  const FLY_MS = 3400;
  const legendEl = $('legend');
  const capsEl = $('captions');
  let active = [], phase = 'init', phaseStart = 0, runElapsed = 0, maxDur = 10, lastSeed = null, first = true, fade = 1;

  const near = (a, b) => Math.hypot((a.pts[0][0] - b.pts[0][0]) * M_PER_DEG, (a.pts[0][1] - b.pts[0][1]) * M_PER_DEG * Math.cos((a.pts[0][0] * Math.PI) / 180)) < 9000;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function pickArea() {
    let seed = runs[(Math.random() * runs.length) | 0];
    for (let i = 0; i < 12 && lastSeed && near(seed, lastSeed); i++) seed = runs[(Math.random() * runs.length) | 0];
    lastSeed = seed;
    const local = runs.filter((r) => near(r, seed));
    return shuffle(local).slice(0, Math.max(2, settings.runnersPerArea));
  }

  function startArea(now) {
    if (settings.colorMode === 'cycle' && now - modeSince > 45000) { modeIdx = (modeIdx + 1) % cycle.length; modeSince = now; }
    const mode = MODES[modeKey()];
    active = pickArea().sort((a, b) => a.t - b.t);
    const med = active.map((r) => r.time).sort((a, b) => a - b)[active.length >> 1];
    const speedup = med / 14;
    maxDur = 0;
    for (const r of active) {
      r.color = mode.color(r);
      r.dur = Math.min(26, Math.max(6, r.time / speedup)) / settings.speed;
      r.d = 0;
      maxDur = Math.max(maxDur, r.dur);
    }
    legendEl.style.opacity = 0;
    setTimeout(() => { legendEl.innerHTML = settings.showLegend ? `<div class="title">${mode.name}</div>${mode.legend()}` : ''; legendEl.style.opacity = 1; }, 400);

    let b = L.latLngBounds(active[0].pts);
    for (const r of active) b.extend(L.latLngBounds(r.pts));
    const opts = { padding: [Math.round(W * 0.14), Math.round(H * 0.14)], maxZoom: Math.min(15, style.max) };
    if (first) { map.fitBounds(b, { ...opts, animate: false }); first = false; phaseStart = now - FLY_MS + 1200; }
    else { map.flyToBounds(b, { ...opts, duration: 3 }); phaseStart = now; }
    phase = 'fly';
    capsEl.innerHTML = '';
    fade = 1;
  }

  function showCaptions() {
    if (!settings.showCaptions) return;
    capsEl.innerHTML = active.map((r) => `<div class="cap" style="--c:${r.color}"><i></i><b>${fmtDate(r)}</b><span>${esc(r.name)} · ${fmtDist(r.dist)} · ${fmtPace(r)}</span></div>`).join('');
    [...capsEl.children].forEach((el, i) => { active[i].capEl = el; setTimeout(() => el.classList.add('in'), 120 * i); });
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- drawing ----------
  function pointAt(r, d) {
    const { cum, pts } = r;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= d) lo = m; else hi = m - 1; }
    if (lo >= pts.length - 1) return { i: lo, p: pts[lo] };
    const f = (d - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
    return { i: lo, p: [pts[lo][0] + (pts[lo + 1][0] - pts[lo][0]) * f, pts[lo][1] + (pts[lo + 1][1] - pts[lo][1]) * f] };
  }
  function tracePath(r, from, to) {
    const a = pointAt(r, from), b = pointAt(r, to);
    let s = map.latLngToContainerPoint(a.p);
    ctx.moveTo(s.x, s.y);
    for (let i = a.i + 1; i <= b.i; i++) { s = map.latLngToContainerPoint(r.pts[i]); ctx.lineTo(s.x, s.y); }
    s = map.latLngToContainerPoint(b.p);
    ctx.lineTo(s.x, s.y);
    return s;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (phase === 'fly' && fade === 1) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of active) {
      if (r.d <= 0) continue;
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.3 * fade;
      ctx.beginPath(); tracePath(r, 0, r.d); ctx.stroke();
      const tail = Math.max(r.total * 0.2, 500);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9 * fade; ctx.lineWidth = 3.5; ctx.shadowColor = r.color; ctx.shadowBlur = 14;
      ctx.beginPath(); const head = tracePath(r, Math.max(0, r.d - tail), r.d); ctx.stroke();
      ctx.shadowBlur = 0;
      if (r.d < r.total) {
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14);
        g.addColorStop(0, '#fff'); g.addColorStop(0.25, r.color); g.addColorStop(1, 'transparent');
        ctx.globalAlpha = fade; ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(head.x, head.y, 14, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- main loop ----------
  // Wait for a real viewport (a hidden window reports 0x0), otherwise the first fitBounds would zoom out to the whole world.
  while (innerWidth === 0 || innerHeight === 0) await new Promise((r) => setTimeout(r, 200));
  resize();
  startArea(performance.now());
  function frame(now) {
    if (phase === 'fly' && now - phaseStart > FLY_MS) { phase = 'run'; phaseStart = now; showCaptions(); }
    if (phase === 'run') {
      runElapsed = (now - phaseStart) / 1000;
      for (const r of active) {
        r.d = Math.min(r.total, (r.total * runElapsed) / r.dur);
        if (r.d >= r.total && r.capEl) r.capEl.classList.add('done');
      }
      if (runElapsed > Math.max(maxDur + 3, settings.areaSeconds)) { phase = 'out'; phaseStart = now; capsEl.querySelectorAll('.cap').forEach((c) => c.classList.remove('in')); }
    } else if (phase === 'out') {
      fade = Math.max(0, 1 - (now - phaseStart) / 1500);
      if (fade === 0) startArea(now);
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- demo data (only with ?demo=1, for trying the look without Strava) ----------
  function demoRuns() {
    const homes = [[51.5074, -0.1278], [40.7128, -74.006], [35.6762, 139.6503], [-33.8688, 151.2093]];
    const out = [];
    for (let i = 0; i < 160; i++) {
      const h = homes[i % homes.length], r = 0.01 + Math.random() * 0.035, ph = Math.random() * 6.28, n = 90, pts = [];
      const cx = h[0] + (Math.random() - 0.5) * 0.04, cy = h[1] + (Math.random() - 0.5) * 0.06;
      for (let k = 0; k <= n; k++) { const a = ph + (k / n) * 6.28; pts.push([cx + r * Math.sin(a) * (1 + 0.3 * Math.sin(3 * a + ph)), cy + r * 1.5 * Math.cos(a) * (1 + 0.2 * Math.cos(2 * a))]); }
      const dist = 3000 + Math.random() * 18000, y = 2019 + (i % 7), d = new Date(Date.UTC(y, (i * 5) % 12, 1 + (i % 27), 7));
      out.push({ id: i, name: ['Morning Run', 'Lunch Run', 'Evening Run', 'Long Run'][i % 4], start: d.toISOString(), t: d / 1000, dist, time: dist / (2.6 + Math.random() * 1.2), elev: Math.random() * 200, type: i % 6 === 0 ? 'TrailRun' : 'Run', pts, poly: '' });
    }
    return out;
  }
})().catch((e) => {
  const m = document.getElementById('msg');
  m.style.display = 'grid';
  m.textContent = 'Something went wrong: ' + e.message;
  console.error(e);
});
