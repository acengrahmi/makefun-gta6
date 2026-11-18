// save.js — the persistent profile. Costa Verde keeps exactly one save in
// localStorage: cash on hand, how far the story has progressed, the best
// Sunset GP time and lifetime earnings. Everything is defensive: a corrupt or
// missing save quietly becomes a fresh profile instead of breaking the game.

const KEY = 'costaverde-save-v1';

export const freshProfile = () => ({
  money: 250,          // cab fare and a sandwich: what you land with
  jobIndex: 0,         // next story job to offer (0..7, 7 = campaign complete)
  raceBest: 0,         // seconds, 0 = never finished
  totalEarned: 0,
  faresDone: 0,
  timesBusted: 0,
});

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshProfile();
    const data = JSON.parse(raw);
    const base = freshProfile();
    for (const k of Object.keys(base)) {
      if (typeof data[k] === 'number' && Number.isFinite(data[k])) base[k] = data[k];
    }
    base.jobIndex = Math.max(0, Math.min(7, Math.floor(base.jobIndex)));
    return base;
  } catch {
    return freshProfile();
  }
}

export function storeProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* private mode / quota: the game simply runs unsaved */
  }
}

export function wipeProfile() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return freshProfile();
}
