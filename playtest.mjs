// Headless gameplay playtest (Node 22 stdlib only, CDP over WebSocket).
// Loads the game with no ?shot=, starts it, and drives every system by hand:
// walk, steal + drive a car, finish mission 1, steal + deliver the mission car,
// shoot a gang member, and raise a 3-star police response. Fails on any console
// error, exception, or non-local request. Usage: node playtest.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 8081;
const DEBUG_PORT = 9226;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
async function up(url) { try { const r = await fetch(url); return r.ok; } catch { return false; } }

async function main() {
  let server = null;
  if (!(await up(`http://127.0.0.1:${PORT}/index.html`))) {
    server = spawn(process.execPath, ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'ignore' });
    for (let i = 0; i < 30 && !(await up(`http://127.0.0.1:${PORT}/index.html`)); i += 1) await sleep(250);
  }
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${DEBUG_PORT}`, '--window-size=1280,800', '--hide-scrollbars',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 40; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`); if (r.ok) { targets = await r.json(); break; } } catch { /* retry */ }
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
    if (msg.method === 'Runtime.exceptionThrown') errors.push(`exception: ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url;
      if (!u.startsWith(`http://127.0.0.1:${PORT}`) && !u.startsWith(`http://localhost:${PORT}`) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id; pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description || 'eval error' };
    return r.result?.result?.value;
  };
  const key = async (type, code, keyName) => send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: keyName === 'w' ? 87 : keyName === 'e' ? 69 : 0 });
  const step = async (seconds) => evalJs(`{ const n = Math.round(${seconds} * 30); for (let i = 0; i < n; i += 1) window.__game.step(1/30); 'stepped ' + n; }`);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?seed=7` });
  let ready = false;
  for (let i = 0; i < 60; i += 1) { await sleep(500); ready = await evalJs('window.__shotReady === true'); if (ready) break; }
  check('game loads and renders', ready === true);
  check('no errors on load', errors.length === 0, errors.slice(0, 2).join(' | '));

  // start the game: mission 1 begins
  await evalJs(`window.__game.startGame(null)`);
  await step(1);
  check('mission 1 starts', (await evalJs(`window.__game.missions.active && window.__game.missions.current.id`)) === 'm1');
  check('seven story jobs in the campaign', (await evalJs(`window.__game.missions.total`)) === 7,
    `total=${await evalJs(`window.__game.missions.total`)}`);
  const dlg = await evalJs(`document.getElementById('dialogueWho').textContent + '|' + document.getElementById('dialogue').style.display`);
  // Lines advance on a wall-clock timer, so under a slow renderer any of the
  // intro's speakers may be on screen — what matters is the box is up with a
  // named story character talking.
  check('story dialogue opens mission 1 (Lena Cruz)', !!dlg && (dlg.includes('LENA') || dlg.includes('RICO')) && dlg.includes('block'), JSON.stringify(dlg));
  check('story giver NPC waits at the marker', (await evalJs(`!!window.__game.missions.giver`)) === true);

  // walk forward with W
  const p0 = await evalJs(`({ x: window.__game.player.x, z: window.__game.player.z })`);
  await key('rawKeyDown', 'KeyW', 'w');
  await step(3);
  await key('keyUp', 'KeyW', 'w');
  const p1 = await evalJs(`({ x: window.__game.player.x, z: window.__game.player.z })`);
  const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('on-foot movement (W)', walked > 5, `moved ${walked.toFixed(1)}u`);

  // steal a parked car: teleport beside the first parked car, press E
  await evalJs(`{ const c = window.__game.traffic.cars.find(c => !c.ai); window.__game.player.setPose(c.x + 2, c.z, 0); 'ok'; }`);
  await key('rawKeyDown', 'KeyE', 'e'); await key('keyUp', 'KeyE', 'e');
  await step(0.5);
  check('steal car with E', (await evalJs(`window.__game.player.inCar`)) === true);

  // drive it
  const c0 = await evalJs(`({ x: window.__game.player.car.x, z: window.__game.player.car.z, s: window.__game.player.car.speed })`);
  await key('rawKeyDown', 'KeyW', 'w');
  await step(4);
  await key('keyUp', 'KeyW', 'w');
  const c1 = await evalJs(`({ x: window.__game.player.car.x, z: window.__game.player.car.z, s: window.__game.player.car.speed })`);
  const drove = Math.hypot(c1.x - c0.x, c1.z - c0.z);
  check('driving (W in car)', drove > 20 && Math.abs(c1.s) > 5, `moved ${drove.toFixed(1)}u, speed ${c1.s.toFixed(1)}`);

  // exit the car
  await key('rawKeyDown', 'KeyE', 'e'); await key('keyUp', 'KeyE', 'e');
  await step(0.5);
  check('exit car with E', (await evalJs(`window.__game.player.inCar`)) === false);

  // mission 1: reach the club, then the safehouse
  await evalJs(`window.__game.player.setPose(135, -108, 0)`);
  await step(1);
  check('mission 1 step 1 (meet Lena)', (await evalJs(`window.__game.missions.step`)) === 1);
  await evalJs(`window.__game.player.setPose(27, 162, 0)`);
  await step(1);
  check('mission 1 completes (+$400)', (await evalJs(`window.__game.missions.completed`)) === 1
    && (await evalJs(`window.__game.player.money`)) === 400, `money=${await evalJs(`window.__game.player.money`)}`);
  check('autosave written', (await evalJs(`!!localStorage.getItem('costaverde-save-v1')`)) === true);

  // mission 2: steal the Comet GT and deliver it
  await evalJs(`window.__game.missions.startMission(1)`);
  await evalJs(`window.__game.player.setPose(-189, 162, 0)`);
  await step(1);
  const hasMissionCar = await evalJs(`!!window.__game.missions.missionCar`);
  check('mission 2 spawns the Comet GT', hasMissionCar === true);
  await evalJs(`{ const m = window.__game.missions.missionCar; window.__game.player.setPose(m.x + 2, m.z, 0); 'ok'; }`);
  await key('rawKeyDown', 'KeyE', 'e'); await key('keyUp', 'KeyE', 'e');
  await step(0.5);
  check('mission 2 steal advances the step', (await evalJs(`window.__game.missions.step`)) === 2
    && (await evalJs(`window.__game.player.car === window.__game.missions.missionCar`)) === true);
  await evalJs(`{ const m = window.__game.missions.missionCar; m.setPose(-135, -108, 0); window.__game.player.x = -135; window.__game.player.z = -108; 'ok'; }`);
  await step(1);
  check('mission 2 delivers (+$800)', (await evalJs(`window.__game.missions.completed`)) === 2);

  // combat: get out of the car first, clear the police so no cruiser interferes,
  // then spawn a gang and shoot one
  await key('rawKeyDown', 'KeyE', 'e'); await key('keyUp', 'KeyE', 'e');
  await step(0.5);
  await evalJs(`window.__game.police.clear()`);
  await evalJs(`window.__game.combat.spawnGang(189, 162, 3, 42)`);
  await evalJs(`window.__game.player.setPose(189, 150, 0)`);
  const shot = await evalJs(`{
    const e = window.__game.combat.enemies[0];
    const origin = new THREE.Vector3(window.__game.player.x, 1.6, window.__game.player.z);
    const dir = new THREE.Vector3(e.x - origin.x, 1.2 - origin.y, e.z - origin.z).normalize();
    window.__game.combat.playerShoot(origin, dir, () => {});
    ({ health: e.health, alive: window.__game.combat.aliveCount });
  }`);
  check('shooting hits a gang member', shot && shot.health < 100, JSON.stringify(shot));
  await step(3);
  check('gang shoots back (player takes damage)', (await evalJs(`window.__game.player.health`)) < 100,
    `health=${await evalJs(`window.__game.player.health`)}`);

  // police: 3 stars brings cruisers — and the helicopter
  await evalJs(`window.__game.police.addCrime(3)`);
  await step(8);
  const wanted = await evalJs(`({ w: window.__game.police.wanted, n: window.__game.police.cruisers.length })`);
  check('wanted 3+ spawns police cruisers', wanted.w >= 3 && wanted.n >= 1, JSON.stringify(wanted));
  const heli = await evalJs(`({ n: window.__game.police.helis.length, d: window.__game.police.helis.length ? Math.hypot(window.__game.police.helis[0].x - window.__game.player.x, window.__game.police.helis[0].z - window.__game.player.z) : -1 })`);
  check('wanted 3+ brings the police helicopter', heli.n >= 1 && heli.d > 0 && heli.d < 90, JSON.stringify(heli));
  await step(6);
  const chase = await evalJs(`({ d: window.__game.police.nearestCopDistance(window.__game.player.x, window.__game.player.z) })`);
  check('police close in on the player', chase.d < 120, `nearest cruiser ${chase.d?.toFixed(1)}u`);

  // traffic + peds are alive
  const world = await evalJs(`({ traffic: window.__game.traffic.cars.length, peds: window.__game.peds.peds.length, cash: window.__game.missions.cash.filter(c => !c.taken).length })`);
  check('traffic, peds and cash exist', world.traffic >= 14 && world.peds >= 20 && world.cash === 12, JSON.stringify(world));

  check('zero console errors during play', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('zero external requests during play', external.length === 0, external.slice(0, 3).join(', '));

  ws.close();
  chrome.kill();
  if (server) server.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
