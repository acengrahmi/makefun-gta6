// Costa Verde — HUD: cash/health/stars, objective bar, dialogue, banners,
// radio lines, speedometer and the live canvas minimap.
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});
  const H = {};
  CV.hud = H;

  let els = null, radioTimer = 0, lastRadio = null;

  H.init = () => {
    els = {
      cash: CV.el('cash'), place: CV.el('place'), health: CV.el('health-fill'),
      stars: CV.el('stars'), heat: CV.el('heat-fill'),
      obj: CV.el('objective'), objTitle: CV.el('obj-title'), objText: CV.el('obj-text'), objDist: CV.el('obj-dist'),
      dlg: CV.el('dialogue'), dlgName: CV.el('dlg-name'), dlgText: CV.el('dlg-text'),
      banner: CV.el('banner'), bTitle: CV.el('banner-title'), bText: CV.el('banner-text'), bSub: CV.el('banner-sub'),
      radio: CV.el('radio'), speed: CV.el('speed'), speedNum: CV.el('speed-num'),
      hurt: CV.el('hurt'), map: CV.el('minimap'),
    };
    H.mctx = els.map.getContext('2d');
  };

  H.update = (S, dt) => {
    if (!els) return;
    const P = S.player;
    els.cash.textContent = CV.fmtMoney(S.cash);
    els.place.textContent = CV.WORLD.placeAt(P.x, P.z);
    els.health.style.width = Math.max(0, S.health) + '%';
    els.health.style.background = S.health > 35 ? 'linear-gradient(90deg,#ffb347,#ff7847)' : '#ff4040';
    els.stars.textContent = '★★★★★'.slice(0, S.wanted) + '☆☆☆☆☆'.slice(0, 5 - S.wanted);
    els.stars.style.opacity = S.wanted ? 1 : 0.35;
    els.heat.style.width = Math.min(100, (S.bustT / 2.2) * 100) + '%';
    els.hurt.style.opacity = S.hurtT > 0 ? 0.5 : 0;

    // Objective bar.
    let title = '', text = '', dist = '';
    if (S.job) {
      const st = CV.systems.jobObjective(S);
      title = 'JOB ' + (S.job.idx + 1) + '/7 · ' + S.job.def.name;
      if (st) {
        text = st.label;
        if (st.t === 'deliver') text += '  ·  ' + Math.max(0, Math.ceil(S.job.stepT)) + 's left';
        if (st.t === 'fight') {
          const left = S.enemies.filter((e) => !e.down).length;
          text += '  ·  ' + left + ' standing';
        }
        dist = Math.round(CV.dist(P.x, P.z, st.x, st.z)) + 'm';
      }
    } else if (S.race.active) {
      title = 'STREET RACE · SUNSET GP';
      text = 'Checkpoint ' + Math.min(S.race.cp + 1, CV.systems.RACE_CPS.length) + '/' + CV.systems.RACE_CPS.length + '  ·  ' + S.race.time.toFixed(1) + 's';
    } else if (S.taxi.state === 'ride') {
      title = 'TAXI FARE';
      text = 'Take your passenger to the gold marker';
      dist = Math.round(CV.dist(P.x, P.z, S.taxi.dx, S.taxi.dz)) + 'm';
    } else if (S.taxi.state === 'hail') {
      title = 'TAXI FARE';
      text = 'A passenger is waving — stop beside them in a car';
    } else if (CV.save.data.nextJob < 7) {
      const j = CV.systems.JOBS[CV.save.data.nextJob];
      title = 'COSTA VERDE';
      text = 'Press T — next job: ' + j.name + ' (' + j.giver + ')';
    } else {
      title = 'COSTA VERDE';
      text = 'All seven jobs done — the city is yours. Race the gate, run fares, own the sunset.';
    }
    els.objTitle.textContent = title;
    els.objText.textContent = text;
    els.objDist.textContent = dist;
    els.obj.style.opacity = S.dialogue ? 0.25 : 1;

    // Dialogue.
    if (S.dialogue) {
      els.dlg.style.display = 'block';
      els.dlgName.textContent = S.dialogue.name.toUpperCase();
      els.dlgText.textContent = S.dialogue.lines[S.dialogue.i] || '';
    } else {
      els.dlg.style.display = 'none';
    }

    // Banner.
    if (S.banner && S.banner.t > 0) {
      els.banner.style.display = 'block';
      els.bTitle.textContent = S.banner.title;
      els.bText.textContent = S.banner.text;
      els.bSub.textContent = S.banner.sub || '';
    } else {
      els.banner.style.display = 'none';
    }

    // Radio line (shows for ~5 s after it is set).
    if (S.radio && S.radio !== lastRadio) { lastRadio = S.radio; radioTimer = 5; }
    if (radioTimer > 0) {
      radioTimer -= dt;
      els.radio.style.display = 'block';
      els.radio.textContent = '📻 ' + lastRadio;
      if (radioTimer <= 0) { els.radio.style.display = 'none'; S.radio = null; lastRadio = null; }
    }

    // Speedometer.
    if (P.mode === 'car') {
      els.speed.style.display = 'block';
      els.speedNum.textContent = Math.round(Math.abs(P.car.speed) * 3.6);
    } else {
      els.speed.style.display = 'none';
    }

    H.drawMap(S);
  };

  H.drawMap = (S) => {
    const g = H.mctx, W = 168, C = W / 2, sc = W / 700;
    const px = (x) => C + x * sc, pz = (z) => C + z * sc;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#141824'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#155e6b'; g.fillRect(0, 0, px(-300), W); // sea
    g.strokeStyle = '#39415e'; g.lineWidth = 1;
    for (const s of CV.WORLD.streets) {
      g.beginPath(); g.moveTo(px(s), 0); g.lineTo(px(s), W); g.stroke();
      g.beginPath(); g.moveTo(0, pz(s)); g.lineTo(W, pz(s)); g.stroke();
    }
    g.strokeStyle = '#ffd76a'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(0, pz(60)); g.lineTo(W, pz(60)); g.stroke();
    const dot = (x, z, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(px(x), pz(z), r || 2.4, 0, 6.29); g.fill(); };
    if (S.job) { const st = CV.systems.jobObjective(S); if (st) dot(st.x, st.z, '#ffd76a', 3.4); }
    if (S.race.active) { const cp = CV.systems.RACE_CPS[S.race.cp]; if (cp) dot(cp[0], cp[1], '#51ff8a', 3.2); }
    if (S.taxi.state === 'hail' && S.taxi.ped) dot(S.taxi.ped.x, S.taxi.ped.z, '#ffe94e', 3);
    if (S.taxi.state === 'ride') dot(S.taxi.dx, S.taxi.dz, '#ffe94e', 3.2);
    for (const e of S.enemies) if (!e.down) dot(e.x, e.z, '#ff5040', 2.2);
    for (const c of S.cruisers) dot(c.x, c.z, '#ff4040', 2.6);
    for (const c of S.cops) if (!c.down) dot(c.x, c.z, '#ff4040', 2);
    for (const h of S.helis) dot(h.x, h.z, '#c77dff', 3);
    // Player arrow.
    const P = S.player;
    g.save();
    g.translate(px(P.x), pz(P.z));
    g.rotate(Math.atan2(Math.sin(P.angle), Math.cos(P.angle)) * -1 + Math.PI);
    // Canvas y is south-positive; world angle 0 faces +z (south). Draw arrow up = facing.
    g.rotate(Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(0, 2); g.lineTo(-3.6, 4); g.closePath(); g.fill();
    g.restore();
  };
})();
