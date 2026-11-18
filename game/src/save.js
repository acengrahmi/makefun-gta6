// save.js — localStorage persistence for Costa Verde: cash, story progress,
// player position, best race time. Everything is best-effort: a private-mode
// browser that refuses storage simply plays a fresh game.

const KEY = 'costa-verde-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Number.isFinite(data.cash) ? data.cash : 120,
      jobIndex: Number.isFinite(data.jobIndex) ? data.jobIndex : 0,
      x: Number.isFinite(data.x) ? data.x : 0,
      z: Number.isFinite(data.z) ? data.z : 40,
      bestRace: Number.isFinite(data.bestRace) ? data.bestRace : 0,
      fares: Number.isFinite(data.fares) ? data.fares : 0,
    };
  } catch { return null; }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: Math.round(state.cash),
      jobIndex: state.jobIndex,
      x: Math.round(state.player.x * 10) / 10,
      z: Math.round(state.player.z * 10) / 10,
      bestRace: state.bestRace || 0,
      fares: state.fares || 0,
    }));
  } catch { /* storage unavailable: play on unsaved */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
