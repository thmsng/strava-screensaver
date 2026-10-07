'use strict';
(async function () {
  const api = window.api;
  const $ = (id) => document.getElementById(id);
  const toast = (t) => ($('toast').textContent = t || '');
  const KEYS = ['mapStyle', 'colorMode', 'units', 'runnersPerArea', 'speed', 'areaSeconds', 'showStats', 'showCaptions', 'showLegend'];
  const fmtVal = { runnersPerArea: (v) => v, speed: (v) => v + '×', areaSeconds: (v) => v + ' s' };

  const s = await api.getSettings();
  for (const k of KEYS) {
    const el = $(k);
    if (el.type === 'checkbox') el.checked = s[k]; else el.value = s[k];
    if ($('v_' + k)) $('v_' + k).textContent = fmtVal[k](s[k]);
    el.addEventListener('input', async () => {
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      if ($('v_' + k)) $('v_' + k).textContent = fmtVal[k](v);
      await api.saveSettings({ [k]: v });
    });
  }

  let polling = null;
  async function refresh() {
    const st = await api.status();
    const el = $('status');
    el.className = st.error ? 'err' : st.connected ? 'ok' : '';
    if (st.error) el.textContent = st.error;
    else if (st.connected) {
      const when = st.syncedAt ? new Date(st.syncedAt).toLocaleString() : 'never';
      el.textContent = `Connected${st.athlete && st.athlete.name ? ' as ' + st.athlete.name : ''} · ${st.runCount} runs · last sync ${when}${st.syncing ? ' · syncing…' : ''}`;
    } else el.textContent = st.hasCredentials ? 'Not connected yet.' : 'Not connected. Create a Strava API app and paste its credentials below.';
    if (st.clientId && !$('clientId').value) $('clientId').value = st.clientId;
    if (st.hasCredentials) $('clientSecret').placeholder = 'Saved. Leave blank to keep it';
    $('howto').open = !st.hasCredentials;
    for (const id of ['sync', 'full', 'disconnect']) $(id).disabled = !st.connected || st.syncing;
    if (st.syncing && !polling) polling = setInterval(refresh, 1500);
    if (!st.syncing && polling) { clearInterval(polling); polling = null; }
    return st;
  }
  const guard = (fn) => async () => {
    try { toast(''); await fn(); } catch (e) { toast(e.message); }
    refresh();
  };

  $('connect').onclick = guard(async () => {
    const id = $('clientId').value.trim();
    const secret = $('clientSecret').value.trim();
    const st = await api.status();
    if (secret || id !== st.clientId) await api.saveCredentials({ clientId: id, clientSecret: secret });
    toast('Complete the authorization in your browser…');
    await api.connect();
    $('clientSecret').value = '';
    toast('Connected. Syncing your runs…');
  });
  $('sync').onclick = guard(async () => { toast('Syncing…'); await api.sync(false); toast('Done.'); });
  $('full').onclick = guard(async () => { toast('Full resync…'); await api.sync(true); toast('Done.'); });
  $('disconnect').onclick = guard(async () => { await api.disconnect(); toast('Disconnected and local run cache cleared.'); });
  $('preview').onclick = () => api.preview();
  $('demo').onclick = () => {
    if (api.isElectron) toast('Demo data is available in web mode: run npm run web, then open settings in the browser.');
    else window.open('saver.html?demo=1', '_blank');
  };
  let exported = null;
  $('export').onclick = async () => {
    try {
      exported = await api.exportWallpaper();
      $('exportInfo').innerHTML = 'Exported ' + exported.count + ' runs to:<br><code>' + exported.index + '</code>';
      if (api.openFolder) $('openFolder').style.display = '';
    } catch (e) { $('exportInfo').textContent = e.message; }
  };
  $('openFolder').onclick = () => exported && api.openFolder(exported.path);
  refresh();
})();
