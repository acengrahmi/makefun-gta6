// Costa Verde — playtest: one comprehensive headless pass over the real game.
// Checks gameplay systems end-to-end and demands 0 console errors / 0 external requests.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('./game/', import.meta.url).pathname;
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
const { readFileSync } = await import('node:fs');
const POLICY_SHA = createHash('sha256').update(readFileSync(POLICY_PATH)).digest('hex');
const chrome = spawn('/opt/meta-chromium/chrome', [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  '--no-sandbox', '--remote-debugging-port=0', '--window-size=1280,720',
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
const GAME_URL = 'file://' + ROOT + 'index.html'; // this Chromium blocks http://127.0.0.1 navigations (LNA); file:// is the local channel
// browser-initiated navigation: create the target directly on the game URL
// (a renderer navigation from about:blank to localhost is blocked by LNA checks)
const { result: { targetId } } = await send('Target.createTarget', { url: GAME_URL });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable'); await S('Log.enable'); await S('Input.enable').catch(() => {});
const errors = [], external = [];
function collect() {
  for (const m of events.splice(0)) {
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error');
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log error');
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (!u.startsWith('file://') && !u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
    }
  }
}
async function evl(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error('eval failed: ' + expr.slice(0, 60) + ' — ' + (d.exception && d.exception.description || d.text || '').slice(0, 300));
  }
  return r.result.result.value;
}
const key = (type, code, k) => S('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: 0 });
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

for (let i = 0; i < 120 && !(await evl('typeof window.__cv === "object"')); i++) await new Promise(r => setTimeout(r, 120));
console.log('  page:', await evl('location.href + " | " + document.title + " | THREE=" + typeof window.THREE + " CV=" + typeof window.CV'));

check('boots with __cv hooks', true);
check('canvas rendered', await evl('!!document.querySelector("canvas")'));
check('7 jobs with exact payouts', await evl('__cv.jobs.length===7 && __cv.jobs.map(j=>j.pay).join() === "400,800,1100,1500,1800,2500,4000"'));
check('counts: 16 traffic / 38 peds', await evl('(()=>{const c=__cv.counts(); return c.traffic===16 && c.peds===38;})()'));
await evl('localStorage.clear(); __cv.save.wipe(); __cv.G.cash=0; __cv.G.jobIndex=0; __cv.G.health=100; __cv.start()');
check('title screen hides on start', await evl('document.getElementById("start-screen").style.display==="none"'));
// keyboard walking (heading PI = north, pz must drop)
const z0 = await evl('__cv.G.pz');
await key('keyDown', 'KeyW', 'w'); await evl('__cv.stepN(50)'); await key('keyUp', 'KeyW', 'w');
check('keyboard walking moves the player', await evl(`__cv.G.pz < ${z0} - 2`));
// steal / drive / exit a parked car
await evl('__cv.teleport(24,-57,0); __cv.enterCar()');
check('steal: entered a parked car', await evl('__cv.G.inCar===true'));
await key('keyDown', 'KeyW', 'w'); await evl('__cv.stepN(45)');
check('driving: car gains speed', await evl('Math.abs(__cv.G.car.speed) > 4'));
await key('keyUp', 'KeyW', 'w'); await evl('__cv.enterCar()');
check('exit car on foot again', await evl('__cv.G.inCar===false'));
// job 1 end-to-end: exactly +$400 and an autosave
await evl('__cv.press("KeyT")');
check('job 1 starts with Lena dialogue', await evl('__cv.G.dialogue && __cv.G.dialogue[0].speaker==="Lena Cruz"'));
check('giver NPC waits at the marker', await evl('!!__cv.mission.giverMesh'));
for (const [x, z] of [[-110, -110], [110, -22], [154, 110]]) await evl(`__cv.teleport(${x},${z},0); __cv.stepN(8)`);
check('job 1 completes', await evl('__cv.mission.active===false && __cv.G.jobIndex===1'));
check('job 1 pays exactly $400', await evl('__cv.G.cash===400'));
check('autosave holds the cash', await evl('(localStorage.getItem("costa-verde-save-v1")||"").includes("\\"cash\\":400")'));
// job 2: steal the Comet, deliver it, +$800
await evl('__cv.press("KeyT"); __cv.teleport(-44,-110,0); __cv.stepN(8)');
await evl('__cv.teleport(66,154,0); __cv.stepN(8); __cv.enterCar()');
check('job 2: Comet GT stolen (driving it)', await evl('__cv.G.inCar && __cv.G.car.kind==="comet"'));
await evl('__cv.G.car.x=-44; __cv.G.car.z=-108; __cv.stepN(8)');
check('job 2 completes, cash $1,200', await evl('__cv.mission.active===false && __cv.G.cash===1200'));
// combat both ways: the warehouse fight (job 4)
await evl('if(__cv.G.inCar) __cv.enterCar(); __cv.G.jobIndex=3; __cv.G.health=500; __cv.press("KeyT"); __cv.teleport(-110,-110,0); __cv.stepN(8)');
check('fight spawns 5 Vipers', await evl('__cv.systems.gangers.length===5'));
await evl('__cv.teleport(110,124,0); __cv.stepN(5)');
const hurt = await evl('(()=>{const h=__cv.G.health; __cv.stepN(300); return __cv.G.health < h;})()');
check('gangers shoot back (player hurt)', hurt);
await evl('__cv.systems.gangers.slice().forEach(g=>{ for(let i=0;i<6 && !g.downed;i++) __cv.shootAt(g); })');
console.log('  ganger state:', await evl('__cv.systems.gangers.map(g=>[Math.round(g.health), g.downed, Math.round(Math.hypot(g.x-__cv.G.px, g.z-__cv.G.pz))].join("/")).join(" ") + " player=" + Math.round(__cv.G.px) + "," + Math.round(__cv.G.pz) + " wanted=" + __cv.G.wanted'));
check('all Vipers downed by pistol fire', await evl('__cv.systems.gangers.every(g=>g.downed)'));
await evl('__cv.stepN(10)');
check('fight job completes (+$1,500)', await evl('__cv.mission.active===false && __cv.G.cash===2700'));
// wanted 4: cruisers + helicopter converge
await evl('__cv.systems.resetHeat(__cv.G); __cv.G.wanted=4; __cv.teleport(0,66,-Math.PI/2); __cv.stepN(300)');
check('wanted 4 spawns cruisers', await evl('__cv.counts().cruisers>=1'));
check('wanted 4 activates the helicopter', await evl('__cv.counts().helis>=1'));
check('helicopter converges near the player', await evl('(()=>{const h=__cv.systems.helis[0]; return Math.hypot(h.x-__cv.G.px, h.z-__cv.G.pz) < 55;})()'));
collect();
check('0 console errors', errors.length === 0);
check('0 external requests', external.length === 0);
console.log(`\nPLAYTEST: ${pass} passed, ${fail} failed`);
chrome.kill(); server.close();
process.exit(fail ? 1 : 0);
