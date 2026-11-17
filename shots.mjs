// Take the entry's 4 screenshots with headless Chromium over CDP (Node 22 stdlib
// only: global WebSocket + fetch). Serves game/ on :8080 first if not already up.
// Usage: node shots.mjs  (writes screenshots/1-chase.jpg … 4-start.jpg)
// Exits 1 if any shot saw a console error, an exception, or a non-local request.
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = process.env.CHROME_BIN
  || '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 8080;
const DEBUG_PORT = 9223;

const SHOTS = [
  { name: '1-chase.jpg', query: '?shot=chase&seed=1', waitMs: 6000 },
  { name: '2-drive.jpg', query: '?shot=drive&seed=1', waitMs: 5000 },
  { name: '3-foot.jpg', query: '?shot=foot&seed=1', waitMs: 4000 },
  { name: '4-start.jpg', query: '?shot=start&seed=1', waitMs: 2000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function up(url) {
  try { const r = await fetch(url); return r.ok; } catch { return false; }
}

async function main() {
  // static server for game/
  let server = null;
  if (!(await up(`http://127.0.0.1:${PORT}/index.html`))) {
    server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'ignore' });
    for (let i = 0; i < 30 && !(await up(`http://127.0.0.1:${PORT}/index.html`)); i += 1) await sleep(250);
  }
  if (!(await up(`http://127.0.0.1:${PORT}/index.html`))) {
    console.error('static server did not come up'); process.exit(1);
  }

  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,800', '--hide-scrollbars',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    'about:blank',
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      if (r.ok) { targets = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!targets) { console.error('chrome devtools did not come up'); chrome.kill(); process.exit(1); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const errors = [];
  const external = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url;
      if (!u.startsWith(`http://127.0.0.1:${PORT}`) && !u.startsWith(`http://localhost:${PORT}`) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        external.push(u);
      }
    }
    if (msg.method === 'Network.loadingFailed') {
      errors.push(`request failed: ${msg.params.errorText}`);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result?.result?.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  let failed = false;
  for (const shot of SHOTS) {
    errors.length = 0; external.length = 0;
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html${shot.query}` });
    // wait for the game to signal readiness, then let the scene play
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      try { ready = await evalJs('window.__shotReady === true'); } catch { ready = false; }
      if (ready) break;
    }
    if (!ready) console.error(`${shot.name}: game never signalled ready`);
    await sleep(shot.waitMs);
    const shotRes = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    const data = shotRes.result?.data;
    if (!data) { console.error(`${shot.name}: no screenshot data`); failed = true; continue; }
    const buf = Buffer.from(data, 'base64');
    writeFileSync(join(here, 'screenshots', shot.name), buf);
    const gameErrors = await evalJs('(window.__errors || []).join(" | ")');
    if (gameErrors) errors.push(`window.__errors: ${gameErrors}`);
    console.log(`${shot.name}: ${buf.length} bytes, errors=${errors.length}, external=${external.length}`);
    if (errors.length) { console.error('  ' + errors.join('\n  ')); failed = true; }
    if (external.length) { console.error('  external requests: ' + external.join(', ')); failed = true; }
    if (!ready) failed = true;
  }

  ws.close();
  chrome.kill();
  if (server) server.kill();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
