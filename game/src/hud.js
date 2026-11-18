// hud.js — everything drawn over the 3D view: cash and wanted stars, health,
// the objective line, dialogue boxes, centre banners, toasts, the race/job
// timer, the minimap, and the title screen. Pure DOM/canvas — the game logic
// lives elsewhere; this file only renders state it is handed.

import { money } from './util.js';

const el = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = el('hud');
    this.moneyEl = el('hud-money');
    this.starsEl = el('hud-stars');
    this.healthEl = el('hud-health-fill');
    this.objectiveEl = el('hud-objective');
    this.dialogueEl = el('dialogue');
    this.dlgName = el('dialogue-name');
    this.dlgText = el('dialogue-text');
    this.bannerEl = el('banner');
    this.bannerTitle = el('banner-title');
    this.bannerSub = el('banner-sub');
    this.toastEl = el('toast');
    this.timerEl = el('hud-timer');
    this.hintEl = el('hud-hint');
    this.titleEl = el('title');
    this.titleSub = el('title-sub');
    this.map = el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.bannerUntil = 0;
    this.toastUntil = 0;
    this.lastStars = -1;
  }

  setMoney(n) { this.moneyEl.textContent = money(n); }
  setHealth(frac) {
    this.healthEl.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    this.healthEl.style.background = frac > 0.35 ? '#7dff5e' : '#ff5d5d';
  }
  setWanted(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    this.starsEl.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    this.starsEl.style.opacity = stars ? '1' : '0.25';
  }
  setObjective(text) {
    this.objectiveEl.textContent = text || '';
    this.objectiveEl.style.opacity = text ? '1' : '0';
  }
  setTimer(text) {
    this.timerEl.textContent = text || '';
    this.timerEl.style.opacity = text ? '1' : '0';
  }
  setHint(text) {
    this.hintEl.textContent = text || '';
    this.hintEl.style.opacity = text ? '1' : '0';
  }
  showDialogue(name, text) {
    this.dlgName.textContent = name;
    this.dlgText.textContent = text;
    this.dialogueEl.style.opacity = '1';
    this.dialogueEl.style.transform = 'translate(-50%, 0)';
  }
  hideDialogue() {
    this.dialogueEl.style.opacity = '0';
    this.dialogueEl.style.transform = 'translate(-50%, 12px)';
  }
  banner(title, sub = '', seconds = 2.6) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.style.opacity = '1';
    this.bannerEl.style.transform = 'translate(-50%, -50%) scale(1)';
    this.bannerUntil = performance.now() + seconds * 1000;
  }
  toast(text, seconds = 3) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    this.toastUntil = performance.now() + seconds * 1000;
  }
  update() {
    const now = performance.now();
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerEl.style.opacity = '0';
      this.bannerEl.style.transform = 'translate(-50%, -50%) scale(0.94)';
      this.bannerUntil = 0;
    }
    if (this.toastUntil && now > this.toastUntil) {
      this.toastEl.style.opacity = '0';
      this.toastUntil = 0;
    }
  }
  showTitle(sub) {
    if (sub) this.titleSub.textContent = sub;
    this.titleEl.style.display = 'flex';
  }
  hideTitle() { this.titleEl.style.display = 'none'; }

  // Minimap: the street grid, the sea, the player arrow, objective markers
  // (gold), race checkpoints (green), taxi work (yellow) and police (blue).
  drawMap({ player, heading, markers, cops }) {
    const g = this.mapCtx, S = this.map.width;
    const w2m = (x, z) => [(x + 280) / 560 * S, (z + 280) / 560 * S];
    g.fillStyle = '#141a24'; g.fillRect(0, 0, S, S);
    const [seaX] = w2m(-246, 0);
    g.fillStyle = '#17486b'; g.fillRect(0, 0, seaX, S);
    g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const c = i * 54;
      const [vx] = w2m(c, 0); g.beginPath(); g.moveTo(vx, 0); g.lineTo(vx, S); g.stroke();
      const [, hz] = w2m(0, c); g.beginPath(); g.moveTo(0, hz); g.lineTo(S, hz); g.stroke();
    }
    const dot = (x, z, color, r = 3) => {
      const [mx, my] = w2m(x, z);
      g.fillStyle = color; g.beginPath(); g.arc(mx, my, r, 0, 6.29); g.fill();
    };
    if (cops) for (const c of cops) dot(c.x, c.z, '#5e9dff', 2.2);
    for (const m of markers) dot(m.x, m.z, m.color, 3.4);
    const [px, py] = w2m(player.x, player.z);
    g.save();
    g.translate(px, py); g.rotate(heading);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(-3.6, 4); g.closePath(); g.fill();
    g.restore();
  }
}
