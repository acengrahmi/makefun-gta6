// shots.mjs — captures the four dossier screenshots for Costa Verde.
//
// Drives the local Muse Chromium over a CDP pipe (no network ports: this
// environment blocks 127.0.0.1 page loads, and the game itself is loaded
// from file://). For each entry in shots.json it opens
// game/index.html#stage=<stage> at 1280x720, waits until the staged scene
// sets window.__stageReady, then saves the frame as a JPEG into
// screenshots/. WebGL is enabled through the hatch policy flags.
//
//   node shots.mjs            (all four)
//   node shots.mjs chase      (just one)

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = process.env.CHROME_BIN || '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const profileDir = join('/tmp', 'cv-shots-profile');
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

// ---- minimal CDP client over --remote-debugging-pipe ----------------------
function connect(args) {
  const child = spawn(CHROME, args, { stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe'] });
  // Pipe convention: the browser reads commands from fd 3, writes replies
  // on fd 4 — the parent's stdio[3] is the write end, stdio[4] the read end.
  const reader = child.stdio[4];
  const writer = child.stdio[3];
  reader.on('error', () => {});
  writer.on('error', () => {});
  let buf = '';
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  reader.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!raw) continue;
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      else for (const fn of listeners) fn(msg);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    writer.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  return { child, send, onEvent: (fn) => listeners.push(fn) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(cdp, sessionId, url, outFile) {
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp.send('Page.navigate', { url }, sessionId);
  // Wait for the staged scene to declare itself ready (the sim is decoupled
  // from rAF, but rendering still rides it — headless manages ~1.3 fps).
  const deadline = Date.now() + 240000;
  let ready = false;
  while (Date.now() < deadline) {
    const res = await cdp.send('Runtime.evaluate',
      { expression: 'window.__stageReady === true', returnByValue: true }, sessionId);
    if (res.result?.result?.value === true) { ready = true; break; }
    await sleep(700);
  }
  if (!ready) throw new Error('stage never became ready: ' + url);
  await sleep(600); // let one more full frame paint
  const shot = await cdp.send('Page.captureScreenshot',
    { format: 'jpeg', quality: 84, fromSurface: true }, sessionId);
  const data = shot.result?.data;
  if (!data) throw new Error('no screenshot data for ' + url);
  writeFileSync(outFile, Buffer.from(data, 'base64'));
  return statSyncSafe(outFile);
}
function statSyncSafe(p) { try { return readFileSync(p).length; } catch { return 0; } }

const wanted = process.argv[2];
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'))
  .filter((s) => !wanted || s.stage === wanted);

const cdp = connect([
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--remote-debugging-pipe', '--window-size=1280,720', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', '--disable-web-security',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hatch-webgl-allowed-domains-file=' + POLICY,
  '--hatch-webgl-allowed-domains-sha256=' + POLICY_SHA,
  '--user-data-dir=' + profileDir, 'about:blank',
]);

try {
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const targetId = created.result.targetId;
  const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  const gameUrl = pathToFileURL(join(here, 'game', 'index.html')).href;
  let runIdx = 0;
  for (const s of shots) {
    const out = join(here, 'screenshots', s.name);
    // The ?run= query matters: a hash-only navigation would NOT reload the
    // page, and every capture would re-shoot the first stage.
    const bytes = await capture(cdp, sessionId, `${gameUrl}?run=${runIdx++}#stage=${s.stage}`, out);
    console.log(`captured ${s.name} (${bytes} bytes)`);
  }
} finally {
  cdp.child.kill('SIGKILL');
}
