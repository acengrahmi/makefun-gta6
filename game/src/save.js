// Costa Verde — localStorage save: cash, story progress, position, race best.
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});
  const KEY = 'costaverde-save-v1';

  CV.save = {
    data: null,
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
      if (!d || typeof d !== 'object') {
        d = { cash: 0, nextJob: 0, jobsDone: 0, x: 150, z: 60, bestRace: 0, fares: 0, racesWon: 0 };
      }
      // Clamp anything odd an older save might hold.
      d.cash = Math.max(0, Math.floor(+d.cash || 0));
      d.nextJob = Math.min(7, Math.max(0, Math.floor(+d.nextJob || 0)));
      d.jobsDone = Math.max(0, Math.floor(+d.jobsDone || 0));
      d.x = Math.max(-280, Math.min(280, +d.x || 150));
      d.z = Math.max(-280, Math.min(280, +d.z || 60));
      d.bestRace = Math.max(0, +d.bestRace || 0);
      this.data = d;
      return d;
    },
    write() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      return this.load();
    },
  };
})();
