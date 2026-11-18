// Costa Verde — playtest: one comprehensive headless pass over the real game.
// Loading, rendering, walking, stealing, driving, all 7 story jobs with exact
// payouts, combat both ways, wanted/police/helicopter, the street race, a taxi
// fare and the autosave — plus 0 console errors and 0 external requests.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const GAME_URL = 'file://' + join(ROOT, 'game', 'index.html');
const CHROME = '/opt/meta-chromium/chrome';
const POLICY = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const POLICY_SHA = '8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6';
const PORT = 9352;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checks = [];
const check = (name, ok, extra) => { checks.push({ name, ok: !!ok, extra: extra || '' }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (extra ? ' — ' + extra : '')); };

async function connect() {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader',
    '--hatch-webgl-allowed-domains-file=' + POLICY,
    '--hatch-webgl-allowed-domains-sha256=' + POLICY_SHA,
    '--remote-debugging-port=' + PORT,
    '--window-size=1280,720', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--user-data-dir=/tmp/cv6-test-profile', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
    catch (e) { await sleep(400); }
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
  const errors = [], external = [];
  try {
    const { result } = await send('Target.createTarget', { url: 'about:blank' });
    const att = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
    const sid = att.result.sessionId;
    await send('Page.enable', {}, sid);
    await send('Runtime.enable', {}, sid);
    await send('Network.enable', {}, sid);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sid);
    on((msg) => {
      if (msg.sessionId !== sid) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (msg.params.exceptionDetails.text || ''));
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
      if (msg.method === 'Network.requestWillBeSent') {
        const u = msg.params.request.url;
        if (!u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
      }
    });
    const evaluate = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
      if (r.result.exceptionDetails) throw new Error('evaluate failed: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
      return r.result.result.value;
    };
    const key = (type, code, k) => send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: 0 }, sid);
    const J = async (expr) => JSON.parse(await evaluate(`JSON.stringify((${expr}))`));

    await send('Page.navigate', { url: GAME_URL }, sid);
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) { await sleep(350); ready = await evaluate('!!(window.CV && CV.api)').catch(() => false); }
    check('game loads and exposes its API', ready);
    await evaluate('CV.api.step(30)');
    const shotLen = await (async () => {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70, fromSurface: true }, sid);
      return r.result.data.length;
    })();
    check('renderer actually draws (real frame captured)', shotLen > 9000, 'jpeg base64 chars ' + shotLen);
    // Logic tests do not need pixels: stub out rendering so fixed steps run fast.
    await evaluate('CV.api.renderer.render = () => {};');

    const counts0 = await J('CV.api.counts()');
    check('traffic >= 20', counts0.traffic >= 20, 'traffic=' + counts0.traffic);
    check('pedestrians >= 44', counts0.peds >= 44, 'peds=' + counts0.peds);
    check('buildings >= 90 colliders', counts0.colliders >= 90, 'colliders=' + counts0.colliders);
    check('7 sailboats', counts0.boats === 7, 'boats=' + counts0.boats);

    await evaluate('CV.api.resetSave(); CV.api.startGame(); CV.api.state.taxi.t = 99999;');
    check('game starts, title hides', await evaluate('CV.api.state.started && document.getElementById("title").style.display === "none"'));

    // Walk with real key input.
    const p0 = await J('({x: CV.api.state.player.x, z: CV.api.state.player.z})');
    await key('keyDown', 'KeyW', 'w');
    await evaluate('CV.api.step(40)');
    await key('keyUp', 'KeyW', 'w');
    const p1 = await J('({x: CV.api.state.player.x, z: CV.api.state.player.z})');
    check('player walks with W', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1.5, `moved ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)}m`);

    // Steal a parked car, drive it, exit.
    const spot = await J('(() => { const c = CV.actors.parked[0]; return { x: c.x, z: c.z }; })()');
    await evaluate(`CV.api.teleport(${spot.x + 2}, ${spot.z})`);
    await evaluate('CV.api.enterCar()');
    check('enter/steal a parked car', await evaluate('CV.api.state.player.mode') === 'car');
    await key('keyDown', 'KeyW', 'w');
    await evaluate('CV.api.step(50)');
    await key('keyUp', 'KeyW', 'w');
    const drv = await J('({ speed: CV.api.state.player.car.speed, x: CV.api.state.player.x, z: CV.api.state.player.z })');
    check('car drives under power', Math.abs(drv.speed) > 3 && Math.hypot(drv.x - spot.x, drv.z - spot.z) > 3, 'speed ' + drv.speed.toFixed(1));
    await evaluate('CV.api.exitCar()');
    check('exit car back on foot', await evaluate('CV.api.state.player.mode') === 'foot');

    // Run one story job entirely inside the page through the real systems.
    const runJob = `((idx) => {
      const S = CV.api.state, SYS = CV.systems;
      S.health = 100; S.taxi.t = 99999;
      const before = S.cash;
      CV.api.startNextJob();
      if (!S.job && !S.dialogue) return { ok: false, why: 'job did not start' };
      let guard = 0;
      while ((S.job || S.dialogue) && guard++ < 900) {
        if (S.dialogue) { SYS.advanceDialogue(S); CV.api.step(2); continue; }
        const st = SYS.jobObjective(S);
        if (!st) break;
        S.health = 100;
        if (st.t === 'goto' || st.t === 'deliver' || st.t === 'escape') { if (S.player.mode === 'car' && st.x < -296) CV.api.exitCar(); CV.api.teleport(st.x, st.z); CV.api.step(3); }
        else if (st.t === 'steal') {
          const jc = S.jobCar;
          for (let tries = 0; tries < 6 && S.player.car !== jc; tries++) {
            if (S.player.mode === 'car') CV.api.exitCar();
            for (const c of [...CV.actors.traffic, ...CV.actors.parked]) {
              if (c !== jc && Math.hypot(c.x - jc.x, c.z - jc.z) < 11) { c.x += 90; c.z += 40; c.mesh.position.set(c.x, 0, c.z); }
            }
            CV.api.teleport(jc.x - 2, jc.z);
            CV.api.enterCar();
          }
          CV.api.step(3);
        }
        else if (st.t === 'fight') {
          CV.api.teleport(st.x + 14, st.z);
          let g2 = 0;
          while (S.enemies.some((e) => !e.down) && g2++ < 260) {
            S.health = 100;
            const e = S.enemies.find((en) => !en.down);
            S.player.angle = Math.atan2(e.x - S.player.x, e.z - S.player.z);
            CV.api.shoot();
            CV.api.step(2);
          }
          CV.api.step(3);
        } else { CV.api.step(3); }
      }
      return { ok: !S.job, delta: S.cash - before, guard };
    })`;

    const expected = [400, 800, 1100, 1500, 1800, 2500, 4000];
    for (let i = 0; i < 7; i++) {
      const res = await J(`${runJob}(${i})`);
      check(`job ${i + 1} completes and pays exactly $${expected[i]}`, res.ok && res.delta === expected[i], JSON.stringify(res));
    }
    check('total story earnings $12,100', await evaluate('CV.api.state.cash') === 12100, 'cash=' + await evaluate('CV.api.state.cash'));

    // Enemy fire hurts the player (combat both ways).
    const hurt = await evaluate(`(() => {
      const S = CV.api.state;
      CV.systems.spawnEnemy(S.scene || CV.api.scene, S, S.player.x + 9, S.player.z);
      S.health = 100;
      let took = false;
      for (let i = 0; i < 420 && !took; i++) { CV.api.step(3); if (S.health < 100) took = true; }
      const e = S.enemies[S.enemies.length - 1];
      if (e) { e.down = true; e.mesh.rotation.x = -Math.PI / 2; }
      S.enemies = S.enemies.filter((en) => !en.down || en !== e);
      return took;
    })()`);
    check('enemy gunfire damages the player', hurt === true);

    // Wanted: cruisers + helicopter arrive.
    await evaluate('CV.api.setWanted(4); CV.api.step(40);');
    const pol = await J('CV.api.counts()');
    check('wanted 4: >=3 cruisers', pol.cruisers >= 3, 'cruisers=' + pol.cruisers);
    check('wanted 4: helicopter on scene', pol.helis >= 1, 'helis=' + pol.helis);
    await evaluate('CV.api.setWanted(5); CV.api.step(40);');
    const pol5 = await J('CV.api.counts()');
    check('wanted 5: second helicopter', pol5.helis >= 2, 'helis=' + pol5.helis);
    await evaluate('CV.systems.resetHeat(CV.api.state); CV.api.setWanted(0); CV.api.step(5);');

    // Street race: drive the gate, then clear every checkpoint.
    const race = await J(`(() => {
      const S = CV.api.state;
      if (S.player.mode !== 'car') { const c = CV.actors.parked[0]; CV.api.teleport(c.x + 2, c.z); CV.api.enterCar(); }
      const car = S.player.car;
      CV.api.teleport(238, 60); car.angle = -Math.PI / 2; S.player.angle = -Math.PI / 2; car.speed = 16;
      let started = false;
      for (let i = 0; i < 240 && !started; i++) { car.speed = Math.max(car.speed, 14); CV.api.step(2); if (S.race.active) started = true; }
      if (!started) return { ok: false, why: 'race never started', x: S.player.x };
      const before = S.cash;
      let g = 0;
      while (S.race.active && g++ < 40) {
        const cp = CV.systems.RACE_CPS[S.race.cp];
        CV.api.teleport(cp[0], cp[1]);
        CV.api.step(4);
      }
      return { ok: !S.race.active, delta: S.cash - before, best: CV.save.data.bestRace, won: CV.save.data.racesWon };
    })()`);
    check('street race starts at the gate and pays $300 on the win', race.ok && race.delta === 300, JSON.stringify(race));

    // Taxi fare end to end.
    const taxi = await J(`(() => {
      const S = CV.api.state;
      S.taxi.t = 0;
      let g = 0;
      while (S.taxi.state !== 'hail' && g++ < 30) CV.api.step(2);
      if (S.taxi.state !== 'hail') return { ok: false, why: 'no hail', state: S.taxi.state };
      const p = S.taxi.ped;
      if (S.player.mode !== 'car') { const c = CV.actors.parked[0]; CV.api.teleport(c.x + 2, c.z); CV.api.enterCar(); }
      CV.api.teleport(p.x + 3, p.z);
      S.player.car.speed = 0;
      CV.api.step(4);
      if (S.taxi.state !== 'ride') return { ok: false, why: 'no pickup', state: S.taxi.state };
      const before = S.cash;
      CV.api.teleport(S.taxi.dx, S.taxi.dz);
      CV.api.step(4);
      return { ok: S.taxi.state === 'idle', fare: S.cash - before, fares: CV.save.data.fares };
    })()`);
    check('taxi fare: hail, pickup, delivery pays', taxi.ok && taxi.fare > 30, JSON.stringify(taxi));

    // Autosave persisted.
    await evaluate('CV.api.step(300)');
    const saved = await J('JSON.parse(localStorage.getItem("costaverde-save-v1") || "{}")');
    const nowCash = await evaluate('CV.api.state.cash');
    check('autosave persists cash + progress', saved.cash === nowCash && saved.nextJob === 7, JSON.stringify(saved));

    check('0 console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('0 external requests', external.length === 0, external.slice(0, 3).join(' | '));

    const failed = checks.filter((c) => !c.ok);
    console.log(`\nPLAYTEST: ${checks.length - failed.length}/${checks.length} passed`);
    if (failed.length) process.exitCode = 1;
  } finally {
    proc.kill('SIGKILL');
  }
}

main().catch((e) => { console.error('playtest crashed:', e.message); process.exit(1); });
