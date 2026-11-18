// playtest.mjs — headless functional test for Costa Verde.
//
// Loads game/index.html#stage=playtest in the local Muse Chromium (CDP
// pipe, file:// — same constraints as shots.mjs) and plays the game through
// its window.CV test surface: walking, driving, crime and police response,
// shooting, the first two story jobs end to end, the Sunset GP, a taxi fare,
// BUSTED, WASTED, save persistence across a reload, and the finale fight.
// Prints one line per check and exits non-zero if any fail.

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = process.env.CHROME_BIN || '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const profileDir = join('/tmp', 'cv-playtest-profile');
rmSync(profileDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });

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
const cdp = connect([
  '--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--no-first-run', '--hide-scrollbars', '--mute-audio',
  '--remote-debugging-pipe', '--window-size=800,450', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', '--disable-web-security',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hatch-webgl-allowed-domains-file=' + POLICY,
  '--hatch-webgl-allowed-domains-sha256=' + POLICY_SHA,
  '--user-data-dir=' + profileDir, 'about:blank',
]);

let sessionId = null;
let pageErrors = 0;
cdp.onEvent((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    pageErrors++;
    console.log('  [page error]', msg.params?.exceptionDetails?.exception?.description?.split('\n')[0] || msg.params?.exceptionDetails?.text);
  }
});

async function ev(expr) {
  const res = await cdp.send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  const r = res.result;
  if (r?.exceptionDetails) {
    throw new Error('evaluate failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + ' :: ' + expr.slice(0, 120));
  }
  return r?.result?.value;
}
const state = () => ev('CV.state()');
const step = (n) => ev(`CV.step(${n})`);
const press = async (k, n = 1) => { await ev(`CV.press('${k}')`); await step(n); };

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
}

try {
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const attached = await cdp.send('Target.attachToTarget', { targetId: created.result.targetId, flatten: true });
  sessionId = attached.result.sessionId;
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  const url = pathToFileURL(join(here, 'game', 'index.html')).href + '#stage=playtest';
  await cdp.send('Page.navigate', { url }, sessionId);
  let booted = false;
  for (let i = 0; i < 120 && !booted; i++) {
    booted = await ev('typeof window.CV === "object" && !!window.CV.game').catch(() => false);
    if (!booted) await sleep(500);
  }
  if (!booted) throw new Error('game never exposed window.CV');
  await step(30);

  // 1 — world composition.
  let s = await state();
  check('world: ~100 buildings', s.buildings >= 90, `${s.buildings} buildings`);
  check('world: 20 traffic cars + comet', s.traffic >= 20, `${s.traffic} cars`);
  check('world: 44 pedestrians', s.peds === 44, `${s.peds} peds`);
  check('fresh profile: $250, job 0', s.money === 250 && s.jobIndex === 0, `$${s.money}`);

  // 2 — ambient life moves.
  const t0 = await ev('({x: CV.game.traffic[3].pos.x, z: CV.game.traffic[3].pos.z})');
  await step(240);
  const t1 = await ev('({x: CV.game.traffic[3].pos.x, z: CV.game.traffic[3].pos.z})');
  check('traffic drives itself', Math.hypot(t1.x - t0.x, t1.z - t0.z) > 1, `moved ${Math.hypot(t1.x - t0.x, t1.z - t0.z).toFixed(1)}`);
  const p0 = await ev('Math.max(...CV.game.civilians.slice(0,8).map(w=>w.pos.x+w.pos.z))');
  await step(300);
  const p1 = await ev('Math.max(...CV.game.civilians.slice(0,8).map(w=>w.pos.x+w.pos.z))');
  check('pedestrians walk', Math.abs(p1 - p0) > 0.3, `drift ${Math.abs(p1 - p0).toFixed(2)}`);

  // 3 — walking.
  const w0 = await state();
  await ev("CV.input.keys.add('w')");
  await step(60);
  await ev('CV.input.keys.clear()');
  const w1 = await state();
  check('player walks', Math.hypot(w1.px - w0.px, w1.pz - w0.pz) > 1.5, `moved ${Math.hypot(w1.px - w0.px, w1.pz - w0.pz).toFixed(1)}`);

  // 4 — enter + drive + exit a car.
  await ev('(() => { const g = CV.game, c = g.traffic[0]; g.player.pos.set(c.pos.x + 2.5, 0, c.pos.z); })()');
  await press('e', 3);
  s = await state();
  check('enter car', s.inCar === true);
  await ev("CV.input.keys.add('w')");
  await step(120);
  const spd = await ev('CV.game.player.car ? Math.abs(CV.game.player.car.speed) : 0');
  await ev('CV.input.keys.clear()');
  check('car drives', spd > 5, `speed ${spd.toFixed(1)}`);
  await press('e', 3);
  s = await state();
  check('exit car', s.inCar === false);

  // 5 — crime, stars, helicopter, cruisers.
  await ev('CV.game.reportCrime(3, CV.game.playerPos)');
  s = await state();
  check('crime raises wanted to 3+', s.stars >= 3, `${s.stars} stars`);
  await step(90);
  s = await state();
  check('helicopter responds at 3 stars', s.heli === true);
  check('cruisers respond', s.cruisers >= 1, `${s.cruisers} cruisers`);
  await ev('CV.game.heat = 0; CV.game.lastCrime = -99;');
  await step(5);

  // 6 — shooting a civilian.
  const hp = await ev(`(() => { const g = CV.game; const w = g.civilians.find(c => !c.dead);
    g.player.pos.set(w.pos.x + 3, 0, w.pos.z);
    const h = Math.atan2(w.pos.x - g.player.pos.x, w.pos.z - g.player.pos.z);
    g.player.heading = h; g.shootCd = 0; g.shoot(h); return w.hp; })()`);
  check('pistol hits', hp < 30, `target hp ${hp}`);
  await ev('CV.game.heat = 0;');

  // 7 — job 1 end to end.
  const talkTo = async (npcKey, lines) => {
    await ev(`(() => { const g = CV.game; const n = g.npcs.${npcKey};
      if (g.player.car) g.exitCar();
      g.player.pos.set(n.pos.x + 1.6, 0, n.pos.z); })()`);
    await press('e', 2);
    for (let i = 0; i < lines + 2; i++) await press('e', 1);
  };
  await talkTo('lena', 3);
  s = await state();
  check('job 1 starts after dialogue', s.jobName === 'Welcome to Costa Verde' && s.jobStep === 0, `step ${s.jobStep}`);
  await ev('(() => { const g = CV.game; g.enterCar(g.traffic[1]); const sp = CV.world.spots.hotel; g.player.car.pos.set(sp.x, 0, sp.z); })()');
  await step(4);
  s = await state();
  check('job 1 pays $400', s.jobIndex === 1 && s.money === 650, `$${s.money}, jobIndex ${s.jobIndex}`);

  // 8 — job 2: steal the Comet.
  await talkTo('sal', 2);
  s = await state();
  check('job 2 starts', s.jobName === 'Hot Property' && s.jobStep === 0);
  await ev('(() => { const g = CV.game; const sp = CV.world.spots.comet; g.player.pos.set(sp.x, 0, sp.z); })()');
  await step(3);
  s = await state();
  check('job 2: reached the lot', s.jobStep === 1, `step ${s.jobStep}`);
  await ev('(() => { const g = CV.game; g.player.pos.set(g.comet.pos.x + 2.4, 0, g.comet.pos.z); })()');
  await press('e', 3);
  s = await state();
  check('job 2: Comet stolen (step + wanted)', s.jobStep === 2 && s.inCar, `step ${s.jobStep}`);
  await ev('(() => { const g = CV.game; const sp = CV.world.spots.garage; g.player.car.pos.set(sp.x, 0, sp.z); })()');
  await step(4);
  s = await state();
  check('job 2 pays $800', s.jobIndex === 2 && s.money === 1450, `$${s.money}`);
  await ev('CV.game.heat = 0;');

  // 9 — Sunset GP.
  await ev('(() => { const g = CV.game; const sp = CV.world.spots.raceStart; g.player.car.pos.set(sp.x, 0, sp.z); })()');
  await press('e', 2);
  s = await state();
  check('race starts', s.race === true);
  for (let i = 0; i < 9 && (await state()).race; i++) {
    await ev('(() => { const g = CV.game; const cp = g.race.checkpoints[g.race.cpIdx]; g.player.car.pos.set(cp.x, 0, cp.z); })()');
    await step(3);
  }
  s = await state();
  check('race finishes + best time saved', s.race === false && s.raceBest > 0, `best ${s.raceBest.toFixed(1)}s`);

  // 10 — taxi fare.
  let fareReady = false;
  for (let i = 0; i < 50 && !fareReady; i++) {
    await ev('CV.game.fareTimer = 0;');
    await step(10);
    fareReady = await ev('CV.game.waitingFares.length > 0');
  }
  check('a fare appears', fareReady);
  if (fareReady) {
    await ev('(() => { const g = CV.game; const w = g.waitingFares[0]; g.player.car.pos.set(w.pos.x, 0, w.pos.z); })()');
    await step(4);
    s = await state();
    check('fare picked up', s.taxi === true);
    await ev('(() => { const g = CV.game; g.player.car.pos.set(g.taxi.dest.x, 0, g.taxi.dest.z); })()');
    await step(4);
    s = await state();
    check('fare delivered + paid', s.taxi === false && s.fares >= 1, `fares ${s.fares}`);
  }

  // 11 — BUSTED: stand still next to a cruiser at 3 stars.
  await ev('(() => { const g = CV.game; if (g.player.car) g.exitCar(); g.heat = 3; g.lastCrime = g.time; })()');
  await step(30);
  await ev('(() => { const g = CV.game; const c = g.cruisers[0]; if (c) { c.pos.set(g.player.pos.x + 2.5, 0, g.player.pos.z); c.speed = 0; } })()');
  await step(30);
  await step(240);
  s = await state();
  const atHospital = Math.hypot(s.px - (-189), s.pz - (-160)) < 8;
  check('busted by police contact', s.dead === true || atHospital, `dead ${s.dead}, atHospital ${atHospital}`);
  await sleep(1800);
  s = await state();
  check('respawn at hospital, heat cleared', s.dead === false && s.stars === 0, `stars ${s.stars}`);

  // 12 — WASTED.
  await ev('CV.game.hurtPlayer(999)');
  s = await state();
  check('lethal damage = wasted', s.dead === true);
  await sleep(1800);
  s = await state();
  check('hospital respawn after wasted', s.dead === false && s.health === 100, `hp ${s.health}`);

  // 13 — save persists across reload.
  const before = await state();
  await cdp.send('Page.reload', { ignoreCache: true }, sessionId);
  let back = false;
  for (let i = 0; i < 120 && !back; i++) {
    back = await ev('typeof window.CV === "object" && !!window.CV.game').catch(() => false);
    if (!back) await sleep(500);
  }
  await step(10);
  s = await state();
  check('save survives reload', s.jobIndex === before.jobIndex && s.money === before.money,
    `jobIndex ${s.jobIndex} (was ${before.jobIndex}), $${s.money} (was $${before.money})`);

  // 14 — finale: the Sunset Showdown fight.
  await ev('(() => { const g = CV.game; g.profile.jobIndex = 6; g.job = null; g.persist(); })()');
  await talkTo('mateo', 2);
  s = await state();
  check('finale starts', s.jobName === 'Sunset Showdown' && s.jobStep === 0, `${s.jobName}`);
  await ev('(() => { const g = CV.game; const sp = CV.world.spots.raceStart; g.player.pos.set(sp.x, 0, sp.z); })()');
  await step(4);
  const fighters = await ev('CV.game.job && CV.game.job.fightSet ? CV.game.job.fightSet.size : -1');
  check('finale spawns 8 Vipers', fighters === 8, `${fighters} fighters`);
  await ev('CV.game.job && [...CV.game.job.fightSet].forEach(w => { w.hp = 5; });');
  for (let i = 0; i < 12; i++) {
    const done = await ev('CV.game.job === null');
    if (done) break;
    await ev(`(() => { const g = CV.game; if (!g.job || !g.job.fightSet) return;
      const w = [...g.job.fightSet][0]; if (!w) return;
      if (g.player.car) g.exitCar();
      g.player.pos.set(w.pos.x + 2, 0, w.pos.z);
      const h = Math.atan2(w.pos.x - g.player.pos.x, w.pos.z - g.player.pos.z);
      g.player.heading = h; g.shootCd = 0; g.shoot(h); })()`);
    await step(3);
  }
  s = await state();
  check('campaign complete', s.jobIndex === 7 && s.over === true, `jobIndex ${s.jobIndex}, over ${s.over}`);

  check('no page errors', pageErrors === 0, `${pageErrors} errors`);
} catch (err) {
  console.log('PLAYTEST ABORTED:', err.message);
  results.push({ name: 'aborted: ' + err.message, ok: false });
} finally {
  cdp.child.kill('SIGKILL');
}
const passed = results.filter((r) => r.ok).length;
console.log(`\nPLAYTEST: ${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
