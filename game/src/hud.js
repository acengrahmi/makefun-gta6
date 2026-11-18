// Costa Verde — HUD: cash, stars, objective bar, dialogue, banners, minimap.
CV.hudBanner = function (G, title, sub) { G.bannerTitle = title; G.bannerSub = sub || ''; G.bannerT = 4.2; };
CV.placeName = function (x, z) {
  if (x < -206) return 'MARINA BOARDWALK';
  if (x < -190) return 'PALM BEACH';
  if (x > 105 && z > 95) return 'EAST WAREHOUSE';
  if (x > 130 && z < -120) return 'SUNSET CLUB';
  if (x > -115 && x < -60 && z > 0 && z < 80) return 'ST. VERDE HOSPITAL';
  if (z > 55 && z < 78) return 'SUNSET BOULEVARD';
  return 'COSTA VERDE';
};
CV.stepText = function (G) {
  const M = CV.mission; if (!M.active) return '';
  const job = CV.JOBS[M.idx], st = job.steps[M.step];
  switch (st.t) {
    case 'meet': return 'Meet ' + job.giver;
    case 'pickup': return 'Pick up the package';
    case 'deliver': return 'Deliver the package — FAST';
    case 'steal': return 'Steal the Comet GT';
    case 'fight': { const left = CV.systems.gangers.filter(g => !g.downed).length; return 'Take out the Vipers — ' + left + ' left'; }
    case 'escape': return 'Escape to the marina!';
  }
  return '';
};
CV.hud = {
  els: null,
  init() {
    this.els = {
      cash: CV.el('hud-cash'), place: CV.el('hud-place'), health: CV.el('hud-health-fill'),
      stars: CV.el('hud-stars'), objective: CV.el('hud-objective'), objTitle: CV.el('hud-obj-title'), objSub: CV.el('hud-obj-sub'),
      dialogue: CV.el('hud-dialogue'), dlgName: CV.el('dlg-name'), dlgText: CV.el('dlg-text'),
      radio: CV.el('hud-radio'), banner: CV.el('hud-banner'), bannerTitle: CV.el('banner-title'), bannerSub: CV.el('banner-sub'),
      speed: CV.el('hud-speed'), minimap: CV.el('minimap'), busted: CV.el('hud-busted'), bustedTitle: CV.el('busted-title'),
      startScreen: CV.el('start-screen'), hint: CV.el('hud-hint'),
    };
    this.mm = this.els.minimap.getContext('2d');
  },
  update(G) {
    const e = this.els; if (!e) return;
    e.cash.textContent = '$' + G.cash.toLocaleString();
    e.place.textContent = CV.placeName(G.px, G.pz);
    e.health.style.width = CV.clamp(G.health, 0, 100) + '%';
    e.health.style.background = G.hurtT > 0 ? '#ff5040' : 'linear-gradient(90deg,#ff9a3d,#ffd94d)';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
    e.stars.textContent = stars;
    e.stars.style.color = G.wanted > 0 ? '#ffd94d' : 'rgba(255,255,255,0.35)';
    // objective bar
    const M = CV.mission;
    if (M.active) {
      const job = CV.JOBS[M.idx], st = job.steps[M.step];
      e.objTitle.textContent = 'JOB ' + (M.idx + 1) + '/7 · ' + job.name + (M.timer > 0 ? ' · ' + Math.ceil(M.timer) + 's left' : ' · ' + Math.round(CV.dist(G.px, G.pz, st.x, st.z)) + 'm');
      e.objSub.textContent = CV.stepText(G);
      e.objective.style.display = 'block';
    } else if (G.started && G.jobIndex < 7) {
      e.objTitle.textContent = 'COSTA VERDE';
      e.objSub.textContent = 'Press T to start the next job — ' + CV.JOBS[G.jobIndex].name;
      e.objective.style.display = 'block';
    } else if (G.started) {
      e.objTitle.textContent = 'COSTA VERDE';
      e.objSub.textContent = 'All seven jobs done — the city is yours.';
      e.objective.style.display = 'block';
    } else e.objective.style.display = 'none';
    // dialogue
    if (G.dialogue && G.dialogue.length) {
      e.dialogue.style.display = 'block';
      e.dlgName.textContent = G.dialogue[0].speaker.toUpperCase();
      e.dlgText.textContent = G.dialogue[0].text;
    } else e.dialogue.style.display = 'none';
    // radio
    if (G.radioT > 0) { e.radio.style.display = 'block'; e.radio.textContent = G.radioText; }
    else e.radio.style.display = 'none';
    // banner
    if (G.bannerT > 0) {
      e.banner.style.display = 'block';
      e.bannerTitle.textContent = G.bannerTitle; e.bannerSub.textContent = G.bannerSub;
    } else e.banner.style.display = 'none';
    // speed + busted
    e.speed.style.display = G.inCar ? 'block' : 'none';
    if (G.inCar) e.speed.innerHTML = Math.round(Math.abs(G.car.speed) * 3.6) + '<span> KM/H</span>';
    e.busted.style.display = G.busted ? 'flex' : 'none';
    if (G.busted) e.bustedTitle.textContent = G.wasted ? 'WASTED' : 'BUSTED';
    this.drawMinimap(G);
  },
  drawMinimap(G) {
    const g = this.mm, S = 220, W2M = v => (v + 260) / 520 * S;
    g.fillStyle = '#20222e'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#2fa3a0'; g.fillRect(0, 0, W2M(-212), S); // sea
    g.fillStyle = '#e8c188'; g.fillRect(W2M(-212), 0, W2M(-196) - W2M(-212), S); // beach
    g.strokeStyle = '#4c4a55'; g.lineWidth = 5;
    for (let i = 0; i < 8; i++) {
      const r = W2M(CV.roadLine(i));
      g.beginPath(); g.moveTo(r, 0); g.lineTo(r, S); g.stroke();
      g.beginPath(); g.moveTo(0, r); g.lineTo(S, r); g.stroke();
    }
    const dot = (x, z, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(W2M(x), W2M(z), r || 3, 0, 6.29); g.fill(); };
    const M = CV.mission;
    if (M.active) { const st = CV.JOBS[M.idx].steps[M.step]; dot(st.x, st.z, '#ffd94d', 4.5); }
    for (const c of CV.systems.cruisers) dot(c.x, c.z, '#ff4040', 3);
    for (const c of CV.systems.footCops) dot(c.x, c.z, '#4f8aff', 2.6);
    for (const h of CV.systems.helis) if (h.active) dot(h.x, h.z, '#c44fff', 3.6);
    // player arrow
    const px = W2M(G.px), pz = W2M(G.pz);
    g.save(); g.translate(px, pz); g.rotate(Math.atan2(Math.sin(G.heading), -Math.cos(G.heading)) + Math.PI);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(-4.4, 5); g.closePath(); g.fill(); g.restore();
  },
};
