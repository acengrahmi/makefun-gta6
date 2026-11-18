// Costa Verde — screenshot capture: drives headless Chromium over CDP,
// stages each scene through the game's own #stage= hooks, gates the cover
// shot geometrically on the helicopter's projected position, writes JPEGs.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const GAME_URL = 'file://' + join(ROOT, 'game', 'index.html');
const CHROME = '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const PORT = 9351;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader',
    '--hatch-webgl-allowed-domains-file=' + POLICY,
    '--hatch-webgl-allowed-domains-sha256=' + POLICY_SHA,
    '--remote-debugging-port=' + PORT,
    '--window-size=1280,720', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--user-data-dir=/tmp/cv6-shots-profile', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      ver = await res.json();
    } catch (e) { await sleep(400); }
  }
  if (!ver) throw new Error('chromium devtools never came up');
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) for (const fn of listeners) fn(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { proc, send, on: (fn) => listeners.push(fn) };
}

async function main() {
  const { proc, send, on } = await connect();
  const errors = [];
  const external = [];
  try {
    const { result } = await send('Target.createTarget', { url: 'about:blank' });
    const targetId = result.targetId;
    const att = await send('Target.attachToTarget', { targetId, flatten: true });
    const sid = att.result.sessionId;
    await send('Page.enable', {}, sid);
    await send('Runtime.enable', {}, sid);
    await send('Network.enable', {}, sid);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
    on((msg) => {
      if (msg.sessionId !== sid) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (msg.params.exceptionDetails.text || ''));
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push('console: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
      }
      if (msg.method === 'Network.requestWillBeSent') {
        const u = msg.params.request.url;
        if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
      }
    });
    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      if (r.result.exceptionDetails) throw new Error('evaluate failed: ' + r.result.exceptionDetails.text + ' ' + expr.slice(0, 80));
      return r.result.result.value;
    };
    const navigate = async (stageName) => {
      // A query change forces a full reload — a hash-only change would not re-run staging.
      await send('Page.navigate', { url: GAME_URL + '?r=' + stageName + '#stage=' + stageName }, sid);
      for (let i = 0; i < 60; i++) {
        await sleep(350);
        const ready = await evaluate('!!(window.CV && CV.api && CV.api.state)').catch(() => false);
        if (ready) return;
      }
      throw new Error('game never became ready for stage ' + stageName);
    };
    const capture = async (file) => {
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84, fromSurface: true }, sid);
      const buf = Buffer.from(shot.result.data, 'base64');
      writeFileSync(join(ROOT, 'screenshots', file), buf);
      console.log(`  ${file}: ${buf.length} bytes`);
      return buf.length;
    };

    const results = {};
    // 4-start: title screen.
    await navigate('start');
    await evaluate('CV.api.step(40)');
    results['4-start.jpg'] = await capture('4-start.jpg');
    // 2-story: Mateo dialogue at the marina.
    await navigate('story');
    await evaluate('CV.api.step(12)');
    results['2-story.jpg'] = await capture('2-story.jpg');
    // 3-vista: sun over the water.
    await navigate('vista');
    await evaluate('CV.api.step(12)');
    results['3-vista.jpg'] = await capture('3-vista.jpg');
    // 1-chase: gated on the helicopter's projection.
    await navigate('chase');
    let gated = false;
    for (let i = 0; i < 70; i++) {
      const info = JSON.parse(await evaluate(`(() => { CV.api.step(5); const h = CV.api.projectHeli(); const s = CV.api.state; return JSON.stringify({ h, kmh: Math.round(Math.abs(s.player.speed) * 3.6), helis: s.helis.length }); })()`));
      if (info.h && info.helis > 0 && info.kmh > 100 && info.h.x > 0.03 && info.h.x < 0.52 && info.h.y > 0.42 && info.h.y < 0.8 && info.h.z < 1) {
        gated = true;
        console.log('  chase gate passed:', JSON.stringify(info));
        break;
      }
      if (i === 69) console.log('  chase gate NOT met, capturing anyway:', JSON.stringify(info));
    }
    results['1-chase.jpg'] = await capture('1-chase.jpg');
    console.log('shots done. gated=' + gated + ' errors=' + errors.length + ' external=' + external.length);
    if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 8).join('\n'));
    if (external.length) console.log('EXTERNAL:\n' + external.slice(0, 8).join('\n'));
  } finally {
    proc.kill('SIGKILL');
  }
}

main().catch((e) => { console.error('shots failed:', e.message); process.exit(1); });
