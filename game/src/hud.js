// hud.js — every 2D layer of Costa Verde: title screen, cash and wanted
// stars, health and bust bars, the objective line, the minimap, dialogue
// boxes, centre banners and the BUSTED / WASTED overlays.

import { CENTERS, SEA_Z } from './util.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['title', 'saveNote', 'hud', 'cash', 'stars', 'objective', 'banner',
      'dialogue', 'dlgWho', 'dlgText', 'bustWrap', 'bustFill', 'healthFill', 'raceInfo',
      'prompt', 'overlay', 'ovTitle', 'ovSub', 'minimap', 'carLabel', 'bustLabel']) {
      this.el[id] = document.getElementById(id);
    }
    this.map = this.el.minimap.getContext('2d');
    this.lastBannerT = -99;
    this.dlgKey = '';
  }

  showTitle(hasSave) {
    this.el.title.style.display = 'flex';
    this.el.saveNote.textContent = hasSave ? 'Saved game found — your cash and story progress are restored.' : '';
    this.el.hud.style.display = 'none';
  }
  hideTitle() {
    this.el.title.style.display = 'none';
    this.el.hud.style.display = 'block';
  }
  showOverlay(title, sub, color) {
    this.el.ovTitle.textContent = title;
    this.el.ovTitle.style.color = color;
    this.el.ovSub.textContent = sub;
    this.el.overlay.style.display = 'flex';
  }
  hideOverlay() { this.el.overlay.style.display = 'none'; }

  update(state) {
    const p = state.player;
    this.el.cash.textContent = '$' + Math.round(state.cash).toLocaleString();
    this.el.stars.textContent = state.wanted > 0 ? '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted) : '';
    this.el.stars.style.color = state.time - state.lastCrime < 3 ? '#ff5d5d' : '#ffd23f';
    this.el.objective.textContent = state.dialogue ? '' : (state.objective || '');
    this.el.healthFill.style.width = Math.max(0, p.hp) + '%';
    this.el.healthFill.style.background = p.hp > 35 ? '#7dff6a' : '#ff5d5d';
    this.el.bustWrap.style.display = state.bust > 0.02 ? 'block' : 'none';
    this.el.bustLabel.style.display = state.bust > 0.02 ? 'block' : 'none';
    this.el.bustFill.style.width = (state.bust * 100) + '%';
    this.el.carLabel.textContent = p.car ? (p.car.kind === 'comet' ? 'COMET GT' : p.car.kind.toUpperCase()) : '';

    if (state.flash && state.time - state.flash.t < 3.4) {
      this.el.banner.textContent = state.flash.text;
      this.el.banner.style.color = state.flash.color;
      this.el.banner.style.opacity = '1';
    } else this.el.banner.style.opacity = '0';

    if (state.race.active) {
      const r = state.race;
      this.el.raceInfo.style.display = 'block';
      this.el.raceInfo.textContent = `SUNSET GP · checkpoint ${Math.min(r.cp + 1, r.checkpoints.length)}/${r.checkpoints.length} · ${(Math.round(r.t * 10) / 10).toFixed(1)}s`;
    } else this.el.raceInfo.style.display = 'none';

    if (state.dialogue) {      const d = state.dialogue;
      const key = d.i + ':' + d.lines[d.i][0];
      if (key !== this.dlgKey) {
        this.dlgKey = key;
        this.el.dlgWho.textContent = d.lines[d.i][0];
        this.el.dlgText.textContent = d.lines[d.i][1];
      }
      this.el.dialogue.style.display = 'block';
    } else this.el.dialogue.style.display = 'none';

    this.el.prompt.style.display = state.promptText ? 'block' : 'none';
    if (state.promptText) this.el.prompt.textContent = state.promptText;
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const g = this.map, S = 176, scale = 0.29;
    const px = (x) => S / 2 + (x - 0) * scale;
    const py = (z) => S / 2 + (z - 40) * scale;
    g.fillStyle = '#20242e'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#175d6e'; g.fillRect(0, py(SEA_Z), S, S - py(SEA_Z));
    g.fillStyle = '#a9835a'; g.fillRect(0, py(277), S, py(SEA_Z) - py(277));
    g.strokeStyle = '#4a4f5c'; g.lineWidth = 2;
    for (const c of CENTERS) {
      g.beginPath(); g.moveTo(px(c), 0); g.lineTo(px(c), S); g.stroke();
      g.beginPath(); g.moveTo(0, py(c)); g.lineTo(S, py(c)); g.stroke();
    }
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, py(0)); g.lineTo(S, py(0)); g.stroke();
    const dot = (x, z, color, r = 3) => { g.fillStyle = color; g.beginPath(); g.arc(px(x), py(z), r, 0, 6.29); g.fill(); };
    for (const c of state.police) dot(c.x, c.z, '#5db9ff', 2.5);
    for (const pd of state.peds) if (pd.role === 'cop' && pd.state !== 'down') dot(pd.x, pd.z, '#5db9ff', 2);
    if (state.race.active) { const cp = state.race.checkpoints[state.race.cp]; if (cp) dot(cp.x, cp.z, '#4de3ff', 4); }
    else if (state.marker) dot(state.marker.x, state.marker.z, state.taxi.phase === 'dropoff' ? '#ffe95d' : '#ffd23f', 4);
    if (state.taxi.phase === 'pickup' && state.taxi.ped) dot(state.taxi.ped.x, state.taxi.ped.z, '#ffe95d', 3.5);
    const p = state.player;
    const ex = p.car ? p.car.x : p.x, ez = p.car ? p.car.z : p.z;
    const eh = p.car ? p.car.heading : p.heading;
    g.save();
    g.translate(px(ex), py(ez));
    g.rotate(-eh + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(-3.6, 4); g.closePath(); g.fill();
    g.restore();
  }
}
