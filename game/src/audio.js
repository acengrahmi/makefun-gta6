// audio.js — every sound in Costa Verde is synthesized with WebAudio: a
// two-oscillator engine, a sunset synthwave music loop, police sirens and
// one-shot effects. No audio files exist anywhere in the game.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.step = 0;
  }

  /** Must be called from a user gesture at least once. Safe to call again. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1200, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  }

  shot() { this.noise(0.12, 0.5, 900); this.tone(160, 0.1, 'square', 0.25, 0, 60); }
  dryFire() { this.tone(1200, 0.03, 'square', 0.08); }
  hit() { this.noise(0.08, 0.3, 500); }
  cash() { this.tone(880, 0.09, 'sine', 0.22); this.tone(1318, 0.16, 'sine', 0.22, 0.07); }
  pickup() { this.tone(660, 0.08, 'triangle', 0.2); this.tone(990, 0.12, 'triangle', 0.2, 0.06); }
  checkpoint() { this.tone(1046, 0.1, 'sine', 0.25); this.tone(1568, 0.18, 'sine', 0.2, 0.08); }
  fail() { this.tone(220, 0.25, 'sawtooth', 0.18, 0, 110); }
  bustedJingle() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, i * 0.16)); }
  wastedJingle() { [330, 262, 208, 165].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.22, i * 0.2)); }
  jobDone() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.22, i * 0.09)); }
  door() { this.tone(180, 0.07, 'square', 0.12, 0, 90); }

  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const sub = this.ctx.createOscillator();
    sub.type = 'square'; sub.frequency.value = 28;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    this.engineOsc.connect(f); sub.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); sub.start();
    this.engineSub = sub;
  }

  /** rpm 0..1, active when the player is driving. */
  engine(rpm, active) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(50 + rpm * 130, t, 0.06);
    if (this.engineSub) this.engineSub.frequency.setTargetAtTime(25 + rpm * 65, t, 0.06);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + rpm * 0.09 : 0, t, 0.09);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0.015;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenFlip = setInterval(() => {
        if (this.sirenOsc) this.sirenOsc.frequency.value = this.sirenOsc.frequency.value > 800 ? 660 : 950;
      }, 380);
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null; this.sirenGain = null;
      clearInterval(this.sirenFlip);
    }
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // Sunset synthwave: Am – F – C – G pads with a soft bass pulse, 100 BPM.
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 196, 261.6], [196, 246.9, 293.7]];
    const bass = [55, 43.65, 32.7, 49];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.step / 4) % 4;
      if (this.step % 4 === 0) {
        for (const f of chords[bar]) this.tone(f, 2.2, 'triangle', 0.045);
        this.tone(bass[bar] * 2, 1.8, 'sine', 0.12);
      }
      if (this.step % 2 === 0) this.tone(bass[bar] * 4, 0.24, 'square', 0.03);
      this.step++;
    }, 600);
  }
}
