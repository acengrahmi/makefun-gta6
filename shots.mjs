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
const profileDir = join('/tmp', 'cv8-shots-profile');
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

// ---- minimal CDP client over --remote-debugging-pipe ----------------------
function connect(args) {
  const child = spawn(CHROME, args, { stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe'] });
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

async function main() {
  const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
  const only = process.argv[2];
  const cdp = connect([
    '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--no-first-run', '--hide-scrollbars', '--mute-audio',
    '--remote-debugging-pipe', '--window-size=1280,720', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--disable-web-security',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--hatch-webgl-allowed-domains-file=${POLICY}`,
    `--hatch-webgl-allowed-domains-sha256=${POLICY_SHA}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ]);
  const { result: { targetId } } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { result: { sessionId } } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  const gameUrl = pathToFileURL(join(here, 'game', 'index.html')).href;

  for (const shot of shots) {
    if (only && shot.stage !== only) continue;
    await cdp.send('Page.navigate', { url: `${gameUrl}?shotrun=${shot.stage}#stage=${shot.stage}` }, sessionId);
    // wait for the staged scene to be ready (poll the flag)
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__stageReady === true', returnByValue: true }, sessionId);
      ready = !!(r.result && r.result.result && r.result.result.value);
      if (!ready) await sleep(250);
    }
    if (!ready) { console.error(`TIMEOUT waiting for stage ${shot.stage}`); process.exitCode = 1; continue; }
    await sleep(350); // let a couple of real frames render at full size
    const shotRes = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, sessionId);
    const data = shotRes.result && shotRes.result.data;
    if (!data) { console.error(`NO SCREENSHOT for ${shot.stage}`); process.exitCode = 1; continue; }
    const out = join(here, 'screenshots', shot.name);
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`captured ${shot.name} (${Math.round(Buffer.from(data, 'base64').length / 1024)} KiB)`);
  }
  cdp.child.kill();
}

main().catch((e) => { console.error(e); process.exit(1); });
