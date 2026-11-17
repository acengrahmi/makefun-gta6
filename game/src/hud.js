// HUD: money, health, wanted stars, mission objective, speed, the minimap, and
// the menus. All DOM — cheap, crisp, and readable in a screenshot.
import { PITCH, ROAD_K, CITY_HALF, LANDMARKS } from './city.js';

export class Hud {
  constructor() {
    this.moneyEl = document.getElementById('moneyBox');
    this.healthEl = document.getElementById('healthBar');
    this.starsEl = document.getElementById('stars');
    this.objTitle = document.getElementById('objTitle');
    this.objText = document.getElementById('objText');
    this.speedEl = document.getElementById('speedBox');
    this.crosshair = document.getElementById('crosshair');
    this.toastEl = document.getElementById('toast');
    this.hintEl = document.getElementById('hint');
    this.bannerEl = document.getElementById('banner');
    this.bannerTitle = document.getElementById('bannerTitle');
    this.bannerSub = document.getElementById('bannerSub');
    this.damageEl = document.getElementById('damage');
    this.menuEl = document.getElementById('menu');
    this.pauseEl = document.getElementById('pauseMenu');
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.dialogueEl = document.getElementById('dialogue');
    this.dialogueWho = document.getElementById('dialogueWho');
    this.dialogueText = document.getElementById('dialogueText');
    this.toastTimer = null;
    this.bannerTimer = null;
    this.dialogueTimer = null;
    this.lastMoney = -1;
    this.lastWanted = -1;
    this.lastHealth = -1;
  }

  setMoney(n) {
    if (n === this.lastMoney) return;
    this.lastMoney = n;
    this.moneyEl.childNodes[0].textContent = `$${n.toLocaleString('en-US')}`;
  }

  setHealth(h) {
    const v = Math.round(h);
    if (v === this.lastHealth) return;
    this.lastHealth = v;
    this.healthEl.style.width = `${Math.max(0, v)}%`;
    this.healthEl.style.background = v > 50
      ? 'linear-gradient(90deg,#ff5f4d,#ffb84d)'
      : 'linear-gradient(90deg,#ff2a1a,#ff5f4d)';
  }

  setWanted(n) {
    if (n === this.lastWanted) return;
    this.lastWanted = n;
    let s = '';
    for (let i = 0; i < 5; i += 1) s += `<span class="${i < n ? '' : 'off'}">★</span>`;
    this.starsEl.innerHTML = s;
  }

  setObjective(title, text) {
    this.objTitle.textContent = title;
    this.objText.textContent = text;
  }

  setSpeed(kmh, driving) {
    this.speedEl.style.display = driving ? 'block' : 'none';
    if (driving) this.speedEl.childNodes[0].textContent = String(Math.round(kmh));
  }

  setCrosshair(on) { this.crosshair.style.display = on ? 'block' : 'none'; }

  setDamageFlash(amount) {
    this.damageEl.style.opacity = String(Math.min(1, amount));
    setTimeout(() => { this.damageEl.style.opacity = '0'; }, 180);
  }

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.textContent = ''; }, ms);
  }

  banner(title, sub, ms = 3200) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.style.display = 'block';
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { this.bannerEl.style.display = 'none'; }, ms);
  }

  /** Play a sequence of story dialogue lines in the dialogue box, one at a time. */
  showDialogue(lines) {
    if (this.dialogueTimer) { clearTimeout(this.dialogueTimer); this.dialogueTimer = null; }
    if (!lines || !lines.length) { this.dialogueEl.style.display = 'none'; return; }
    let i = 0;
    const showNext = () => {
      if (i >= lines.length) {
        this.dialogueEl.style.display = 'none';
        this.dialogueTimer = null;
        return;
      }
      const line = lines[i];
      i += 1;
      this.dialogueWho.textContent = line.who;
      this.dialogueText.textContent = line.text;
      this.dialogueEl.style.display = 'block';
      this.dialogueTimer = setTimeout(showNext, 4600);
    };
    showNext();
  }

  hideDialogue() {
    if (this.dialogueTimer) { clearTimeout(this.dialogueTimer); this.dialogueTimer = null; }
    this.dialogueEl.style.display = 'none';
  }

  showMenu(show) { this.menuEl.style.display = show ? 'flex' : 'none'; }
  showPause(show, stats) {
    this.pauseEl.style.display = show ? 'flex' : 'none';
    if (show && stats) document.getElementById('pauseStats').textContent = stats;
  }

  /** Draw the top-down minimap: roads, buildings, player, cars, police, objective. */
  drawMinimap(player, traffic, police, missions, city) {
    const ctx = this.mapCtx;
    const S = 190;
    const scale = S / (CITY_HALF * 2 + 30);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.fillStyle = '#0e1a24';
    ctx.fillRect(0, 0, S, S);
    // sea at the bottom edge
    ctx.fillStyle = '#1a6a8a';
    ctx.fillRect(0, S - 14, S, 14);
    // roads
    ctx.strokeStyle = '#4a4f58';
    ctx.lineWidth = 5;
    for (const k of ROAD_K) {
      const c = k * PITCH;
      const [x1] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
      const [, y1] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(S, y1); ctx.stroke();
    }
    // buildings
    ctx.fillStyle = '#7a8a9a';
    for (const b of city.colliders) {
      const [x, y] = toMap(b.minX, b.minZ);
      const [x2, y2] = toMap(b.maxX, b.maxZ);
      ctx.fillRect(x, y, x2 - x, y2 - y);
    }
    // cash pickups
    ctx.fillStyle = '#2aff7a';
    for (const c of missions.cash) {
      if (c.taken) continue;
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // traffic cars
    ctx.fillStyle = '#e8e8e8';
    for (const car of traffic.cars) {
      const [x, y] = toMap(car.x, car.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // police
    ctx.fillStyle = '#4da6ff';
    for (const c of police.cruisers) {
      const [x, y] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // police helicopters
    ctx.fillStyle = '#c86bff';
    for (const h of police.helis || []) {
      const [x, y] = toMap(h.x, h.z);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // mission marker
    const s = missions.currentStep;
    if (s && missions.active) {
      const [x, y] = toMap(s.x, s.z);
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // player arrow
    const [px, py] = toMap(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.heading);
    ctx.fillStyle = '#ff5f4d';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    void LANDMARKS;
  }
}
