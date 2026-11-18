// Costa Verde — screenshot tooling: serves game/, drives headless Chromium over CDP,
// stages each scene through the game's own hooks and captures 1280x720 JPEGs.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('./game/', import.meta.url).pathname;
const OUT = new URL('./screenshots/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const data = await readFile(join(ROOT, '.' + p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// this Chromium build requires a Hatch WebGL domain policy at startup:
// the platform's canonical all-origins contract file plus its SHA-256.
const POLICY_PATH = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = createHash('sha256').update(readFileSync(POLICY_PATH)).digest('hex');
const chrome = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0', '--window-size=1280,720',
  '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests',
  '--hatch-webgl-allowed-domains-file=' + POLICY_PATH, '--hatch-webgl-allowed-domains-sha256=' + POLICY_SHA, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = ''; chrome.stderr.on('data', d => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) res(m[0]); });
  setTimeout(() => rej(new Error('chrome start timeout')), 25000);
});
let _id = 0; const pending = new Map(); const events = [];
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
});
function send(method, params = {}, sessionId) {
  return new Promise(res => { const i = ++_id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
}
// browser-initiated navigation: each page is a target created directly on its
// URL (a renderer navigation from about:blank to localhost is LNA-blocked)
let sessionId = null;
const S = (m, p) => send(m, p, sessionId);
async function open(url) {
  const { result: { targetId } } = await send('Target.createTarget', { url });
  const att = await send('Target.attachToTarget', { targetId, flatten: true });
  sessionId = att.result.sessionId;
  await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable'); await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
}

const errors = [], external = [];
function collect() {
  for (const m of events.splice(0)) {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.text || ''));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error');
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text);
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (!u.startsWith('file://') && !u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
    }
  }
}
async function evl(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error('eval failed: ' + expr.slice(0, 60) + ' — ' + r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function waitCv() {
  for (let i = 0; i < 120; i++) { if (await evl('typeof window.__cv === "object"')) return; await new Promise(r => setTimeout(r, 120)); }
  throw new Error('__cv never appeared');
}
async function capture(name) {
  const shot = await S('Page.captureScreenshot', { format: 'jpeg', quality: 84 });
  await writeFile(join(OUT, name), Buffer.from(shot.result.data, 'base64'));
  console.log('captured', name);
}
await mkdir(OUT, { recursive: true });
const base = 'file://' + ROOT + 'index.html'; // this Chromium blocks http://127.0.0.1 navigations (LNA); file:// + #stage= is the local channel

// 4-start: title screen over the orbiting city
await open(base);
await waitCv(); await evl('__cv.stepN(40)');
await capture('4-start.jpg');
// 2-story: Mateo dialogue at the marina
await open(base + '#stage=story');
await waitCv(); await evl('__cv.stepN(320)');
await capture('2-story.jpg');
// 3-vista: coast postcard
await open(base + '#stage=vista');
await waitCv(); await evl('__cv.stepN(300)');
await capture('3-vista.jpg');
// 1-chase: geometric gate — capture only while the helicopter is in frame at speed
await open(base + '#stage=chase');
await waitCv();
let ready = false;
for (let i = 0; i < 90 && !ready; i++) ready = await evl('__cv.stepN(2), __cv.chaseReady() && __cv.G.car.x > -120');
console.log('chaseReady:', ready);
await capture('1-chase.jpg');

collect();
console.log('console errors:', errors.length, errors.slice(0, 3));
console.log('external requests:', external.length, external.slice(0, 3));
chrome.kill(); server.close();
process.exit(errors.length || external.length ? 1 : 0);
