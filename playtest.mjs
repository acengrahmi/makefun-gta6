// playtest.mjs — headless functional test for Costa Verde.
//
// Loads game/index.html in the local Muse Chromium (CDP pipe, file:// —
// the same constraints as shots.mjs) and plays the game through its
// window.CV test surface: title → start, walking, driving, crime and police
// response, gunfire, story jobs 1, 2 and 4 end to end, the Sunset GP, a
// taxi fare, BUSTED, WASTED, and save persistence across a reload.
// Prints one line per check and exits non-zero if any fail.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = process.env.CHROME_BIN || '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const profileDir = join('/tmp', 'cv8-playtest-profile');
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

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
let passed = 0, failed = 0;
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${extra}`); }
}

async function main() {
  const pageErrors = [];
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
  cdp.onEvent((msg) => {
    if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === sessionId) {
      const d = msg.params.exceptionDetails;
      pageErrors.push((d.exception && d.exception.description) || d.text || 'unknown');
    }
  });
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    const res = r.result;
    if (res && res.exceptionDetails) throw new Error('eval failed: ' + expr + ' → ' + JSON.stringify(res.exceptionDetails).slice(0, 300));
    return res && res.result ? res.result.value : undefined;
  };
  const gameUrl = pathToFileURL(join(here, 'game', 'index.html')).href;
  await cdp.send('Page.navigate', { url: gameUrl }, sessionId);
  let loaded = false;
  for (let i = 0; i < 80 && !loaded; i++) { loaded = await ev('!!window.CV').catch(() => false); if (!loaded) await sleep(250); }
  check('page loads and exposes window.CV', loaded);
  await sleep(600);

  const counts = await ev('CV.counts()');
  check('city has ~97 buildings', counts.buildings >= 90 && counts.buildings <= 110, JSON.stringify(counts));
  check('20 traffic cars', counts.traffic === 20, JSON.stringify(counts));
  check('44+ pedestrians', counts.peds >= 44, JSON.stringify(counts));
  check('title screen is showing', await ev('CV.mode()') === 'title');

  await ev('CV.start()');
  check('game starts into play mode', await ev('CV.mode()') === 'play');

  // walking
  const p0 = await ev('CV.pos()');
  await ev('CV.keys.KeyW = true; CV.step(70); CV.keys.KeyW = false');
  const p1 = await ev('CV.pos()');
  check('player walks', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2, JSON.stringify([p0, p1]));

  // enter a parked car and drive it
  await ev('CV.teleport(30, 249)'); // beside the parked car at (30,252)
  await ev('CV.step(3); CV.toggleCar()');
  check('player enters a parked car', await ev('CV.pos().inCar') === true);
  const c0 = await ev('CV.pos()');
  await ev('CV.keys.KeyW = true; CV.step(150); CV.keys.KeyW = false');
  const c1 = await ev('CV.pos()');
  check('car drives', Math.hypot(c1.x - c0.x, c1.z - c0.z) > 12, JSON.stringify([c0, c1]));
  await ev('CV.toggleCar()');
  check('player exits the car', await ev('CV.pos().inCar') === false);

  // gunfire fells a pedestrian target (and draws a wanted star)
  await ev('CV.setWanted(0); CV.step(30)');
  const pedPos = await ev('(() => { const pd = CV.nearestPedByRole("ped"); return pd ? { x: pd.x, z: pd.z } : null; })()');
  check('found a pedestrian target', !!pedPos);
  if (pedPos) {
    await ev(`CV.teleport(${pedPos.x + 6}, ${pedPos.z}); CV.step(2); CV.aim(${pedPos.x}, ${pedPos.z}); CV.fire(); CV.step(2)`);
    const down = await ev(`CV.state.peds.some(pd => Math.hypot(pd.x - ${pedPos.x}, pd.z - ${pedPos.z}) < 4 && (pd.state === "down" || pd.state === "flee"))`);
    check('gunfire hits (ped down or fleeing)', down === true);
    check('crime raises the wanted level', await ev('CV.wanted()') >= 1);
  }
  await ev('CV.setWanted(0); CV.step(30)');

  // police response at 3 stars: cruisers + helicopter
  await ev('CV.setWanted(3); CV.step(120)');
  check('police cruisers respond', await ev('CV.state.police.length') >= 2, await ev('String(CV.state.police.length)'));
  check('helicopter joins at 3 stars', await ev('CV.state.heli.active') === true);
  await ev('CV.setWanted(0); CV.step(60)');
  check('police stand down at 0 stars', await ev('CV.state.police.length') === 0);

  // ---- job 1: Welcome to Costa Verde ------------------------------------
  const cash0 = await ev('CV.cash()');
  await ev('CV.teleport(16, 20); CV.step(3); CV.interact()');
  check('job 1 dialogue opens with Lena', await ev('!!CV.dialogue()'));
  await ev('CV.interact(); CV.interact(); CV.interact()');
  check('job 1 advances to the boardwalk step', await ev('CV.job().step') === 1, await ev('JSON.stringify(CV.job())'));
  await ev('CV.teleport(0, 296); CV.step(5)');
  check('job 1 goto step completes', await ev('CV.job().step') === 2, await ev('JSON.stringify(CV.job())'));
  await ev('CV.teleport(16, 20); CV.step(3); CV.interact(); CV.interact(); CV.interact(); CV.step(5)');
  check('job 1 completes and pays $400', await ev('CV.job().index') === 1 && await ev('CV.cash()') === cash0 + 400,
    `cash ${cash0} → ${await ev('CV.cash()')}, job ${await ev('JSON.stringify(CV.job())')}`);

  // ---- job 2: Hot Property ------------------------------------------------
  await ev('CV.teleport(-84, -12); CV.step(3); CV.interact(); CV.interact(); CV.interact(); CV.step(3)');
  check('job 2 advances to the steal step', await ev('CV.job().step') === 1, await ev('JSON.stringify(CV.job())'));
  await ev('CV.teleport(-98, -33); CV.step(3); CV.toggleCar(); CV.step(3)');
  check('stealing the Comet GT advances the job', await ev('CV.job().step') === 2 && await ev('CV.pos().inCar') === true,
    await ev('JSON.stringify(CV.job())'));
  await ev('CV.teleport(-196, 226); CV.step(5)');
  check('job 2 completes and pays $800', await ev('CV.job().index') === 2 && await ev('CV.cash()') === cash0 + 1200,
    `cash → ${await ev('CV.cash()')}, job ${await ev('JSON.stringify(CV.job())')}`);
  await ev('CV.setWanted(0); CV.step(30); CV.toggleCar(); CV.step(3)');
  check('player steps out of the Comet', await ev('CV.pos().inCar') === false);

  // ---- job 4: Payback Time (viper fight) -----------------------------------
  await ev('CV.beginJob(3); CV.teleport(-84, -12); CV.step(3); CV.interact(); CV.interact(); CV.interact(); CV.step(5)');
  check('job 4 spawns 5 Vipers', await ev('CV.state.vipers.filter(v => v.state !== "down").length') === 5,
    await ev('String(CV.state.vipers.length)'));
  for (let tries = 0; tries < 16; tries++) {
    if (await ev('CV.job().index') === 4) break;
    await ev(`(() => {
      const v = CV.state.vipers.find(v => v.state !== 'down');
      if (!v) return;
      CV.teleport(v.x + 7, v.z); CV.heal();
    })()`);
    await ev('CV.step(2)');
    await ev('(() => { const v = CV.state.vipers.find(v => v.state !== "down"); if (v) CV.aim(v.x, v.z); })()');
    await ev('CV.fire(); CV.step(16); CV.fire(); CV.step(4)');
  }
  check('all 5 Vipers down, job 4 pays $1500', await ev('CV.job().index') === 4 && await ev('CV.cash()') === cash0 + 2700,
    `cash → ${await ev('CV.cash()')}, job ${await ev('JSON.stringify(CV.job())')}, vipers down ${await ev('String(CV.state.vipers.filter(v => v.state === "down").length)')}`);
  await ev('CV.setWanted(0); CV.step(30); CV.heal()');

  // ---- Sunset GP ------------------------------------------------------------
  await ev('(() => { const c = CV.state.parked.find(c => c.id === "comet"); if (c) CV.teleport(c.x + 2, c.z); })(); CV.step(3); CV.toggleCar(); CV.step(3)'); // back into the Comet at the lockup
  check('in a car for the race', await ev('CV.pos().inCar') === true);
  await ev('CV.teleport(226, 0); CV.interact(); CV.step(3)');
  check('Sunset GP starts', await ev('CV.race().active') === true);
  for (let i = 0; i < 9; i++) {
    await ev(`(() => { const cp = CV.race().checkpoints[CV.race().cp]; if (cp) CV.teleport(cp.x, cp.z); })(); CV.step(4)`);
  }
  check('Sunset GP finishes and pays $600', await ev('CV.race().active') === false && await ev('CV.cash()') === cash0 + 3300,
    `cash → ${await ev('CV.cash()')}, race ${await ev('JSON.stringify(CV.race())')}`);
  check('best race time recorded', await ev('CV.state.bestRace') > 0);

  // ---- taxi fare ---------------------------------------------------------------
  await ev('CV.state.taxi.timer = 0.01; CV.step(10)');
  check('a taxi fare appears', await ev('CV.taxi().phase') === 'pickup', await ev('JSON.stringify(CV.taxi())'));
  await ev('(() => { const pd = CV.state.taxi.ped; if (pd) CV.teleport(pd.x + 2, pd.z); })(); CV.step(6)');
  check('fare gets in', await ev('CV.taxi().phase') === 'dropoff', await ev('JSON.stringify(CV.taxi())'));
  const cashTaxi = await ev('CV.cash()');
  await ev('(() => { const d = CV.state.taxi.dest; if (d) CV.teleport(d.x, d.z); })(); CV.step(6)');
  check('fare pays and the taxi resets', await ev('CV.taxi().phase') === 'idle' && await ev('CV.cash()') > cashTaxi,
    `cash ${cashTaxi} → ${await ev('CV.cash()')}`);
  await ev('CV.toggleCar(); CV.step(3)');

  // ---- BUSTED ---------------------------------------------------------------------
  await ev('CV.setWanted(2)');
  let busted = false;
  for (let i = 0; i < 40 && !busted; i++) {
    await ev('CV.step(60)');
    busted = await ev('CV.mode()') === 'busted';
  }
  check('foot cop busts the player', busted, `mode ${await ev('CV.mode()')}, bust ${await ev('CV.bust()')}`);
  await ev('CV.step(200)');
  check('player respawns at the station', await ev('CV.mode()') === 'play' && await ev('CV.wanted()') === 0);

  // ---- WASTED ----------------------------------------------------------------------
  await ev('CV.hurt(500); CV.step(10)');
  check('lethal damage wastes the player', await ev('CV.mode()') === 'wasted');
  await ev('CV.step(220)');
  const hpAfter = await ev('CV.pos().hp');
  check('player wakes at the hospital, healed', await ev('CV.mode()') === 'play' && hpAfter === 100, `hp ${hpAfter}`);

  // ---- save persistence ---------------------------------------------------------------
  await ev('CV.step(330)');
  const savedCash = await ev('CV.cash()');
  const raw = await ev('CV.saveRaw()');
  check('save is written to localStorage', !!raw && JSON.parse(raw).cash === savedCash, String(raw).slice(0, 120));
  await cdp.send('Page.navigate', { url: gameUrl }, sessionId);
  let reloaded = false;
  for (let i = 0; i < 80 && !reloaded; i++) { reloaded = await ev('!!window.CV').catch(() => false); if (!reloaded) await sleep(250); }
  await sleep(400);
  check('cash survives a reload', await ev('CV.cash()') === savedCash, `saved ${savedCash}, after reload ${await ev('CV.cash()')}`);

  check('zero page errors across the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  console.log(`\n${passed} passed, ${failed} failed`);
  cdp.child.kill();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('PLAYTEST CRASH', e); process.exit(2); });
