// Costa Verde — localStorage save: cash, story progress, position.
CV.save = {
  KEY: 'costa-verde-save-v1',
  data: { cash: 0, jobIndex: 0, px: 150, pz: 176 },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          this.data.cash = CV.clamp(Math.floor(+d.cash) || 0, 0, 99999999);
          this.data.jobIndex = CV.clamp(Math.floor(+d.jobIndex) || 0, 0, 7); // clamp old saves
          if (isFinite(+d.px)) this.data.px = CV.clamp(+d.px, -260, 260);
          if (isFinite(+d.pz)) this.data.pz = CV.clamp(+d.pz, -260, 260);
        }
      }
    } catch (e) { /* fresh save */ }
    return this.data;
  },
  store() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  },
  wipe() { try { localStorage.removeItem(this.KEY); } catch (e) {} this.data = { cash: 0, jobIndex: 0, px: 150, pz: 176 }; },
};
