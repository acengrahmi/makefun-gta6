// audio.js — every sound in Costa Verde is synthesized with WebAudio at
// runtime: a slow synthwave loop (bass, pad, hats, a lead sparkle), an engine
// hum whose pitch follows the car, two-tone sirens, and one-shot effects for
// gunfire, cash, checkpoints and UI. No audio files exist anywhere.
//
// The context is created lazily on the first user gesture (browser autoplay
// rules); staged/headless runs pass { silent: true } and never hear a thing.

export class SoundBank {
  constructor({ silent = false } = {}) {
    this.silent = silent;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.step = 0;
    this.nextNoteTime = 0;
    this.timer = null;
  }

  unlock() {
    if (this.silent || this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);
    this.startMusic();
    this.startEngine();
    this.startSiren();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.03);
    }
  }

  // --- music: a 8-bar loop in A minor at 92 BPM, scheduled ahead of time ---
  startMusic() {
    const bpm = 92, spb = 60 / bpm, bar = spb * 4;
    // Am — F — C — G, one chord per bar, twice.
    const chords = [
      [110.0, 220.0, 261.63, 329.63], [87.31, 174.61, 220.0, 261.63],
      [130.81, 196.0, 261.63, 329.63], [98.0, 196.0, 246.94, 293.66],
      [110.0, 220.0, 261.63, 329.63], [87.31, 174.61, 220.0, 261.63],
      [130.81, 196.0, 261.63, 329.63], [98.0, 164.81, 246.94, 392.0],
    ];
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    const tick = () => {
      if (!this.ctx) return;
      while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
        const barIdx = Math.floor(this.step / 4) % 8;
        const beat = this.step % 4;
        const chord = chords[barIdx];
        const t = this.nextNoteTime;
        if (beat === 0) this.pad(chord, t, bar);
        this.bass(chord[0], t, spb * 0.95);
        if (beat % 2 === 0) this.bass(chord[0], t + spb / 2, spb * 0.4);
        this.hat(t, beat % 2 === 0 ? 0.05 : 0.09);
        if (barIdx % 2 === 1 && beat === 3) this.lead(chord[3] * 2, t, spb * 0.8);
        this.step++;
        this.nextNoteTime += spb;
      }
    };
    this.timer = setInterval(tick, 40);
  }

  tone({ freq, freqEnd, type = 'sine', t, dur, vol, dest }) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  pad(chord, t, dur) {
    for (const f of chord.slice(1)) {
      this.tone({ freq: f, type: 'triangle', t, dur, vol: 0.05, dest: this.musicGain });
      this.tone({ freq: f * 1.003, type: 'sine', t, dur, vol: 0.03, dest: this.musicGain });
    }
  }
  bass(freq, t, dur) {
    this.tone({ freq, type: 'sawtooth', t, dur, vol: 0.10, dest: this.musicGain });
    this.tone({ freq: freq / 2, type: 'square', t, dur, vol: 0.05, dest: this.musicGain });
  }
  lead(freq, t, dur) {
    this.tone({ freq, type: 'square', t, dur, vol: 0.035, dest: this.musicGain });
  }
  hat(t, vol) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 0.03);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(t);
  }

  // --- continuous voices: engine + siren, driven per-frame by the game ---
  startEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }
  setEngine(on, speedRatio) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.055 : 0, t, 0.09);
    if (on) this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 130, t, 0.06);
  }
  startSiren() {
    const c = this.ctx;
    this.sirenOsc = c.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }
  setSiren(on, phase) {
    if (!this.ctx || !this.sirenGain) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.016 : 0, t, 0.1);
    if (on) this.sirenOsc.frequency.setTargetAtTime(phase % 1 < 0.5 ? 660 : 880, t, 0.02);
  }

  // --- one-shots ---
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  shot() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.14);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = c.createGain(); g.gain.value = 0.30;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    this.tone({ freq: 160, freqEnd: 55, type: 'square', t, dur: 0.09, vol: 0.10 });
  }
  hit() { if (this.ctx) this.tone({ freq: 240, freqEnd: 90, type: 'square', t: this.now(), dur: 0.08, vol: 0.12 }); }
  cash() {
    if (!this.ctx) return;
    const t = this.now();
    this.tone({ freq: 1318, type: 'sine', t, dur: 0.09, vol: 0.12 });
    this.tone({ freq: 1760, type: 'sine', t: t + 0.07, dur: 0.16, vol: 0.12 });
  }
  beep(freq = 880) { if (this.ctx) this.tone({ freq, type: 'sine', t: this.now(), dur: 0.12, vol: 0.10 }); }
  fail() { if (this.ctx) this.tone({ freq: 220, freqEnd: 110, type: 'sawtooth', t: this.now(), dur: 0.35, vol: 0.10 }); }
  door() { if (this.ctx) this.tone({ freq: 180, freqEnd: 90, type: 'sine', t: this.now(), dur: 0.10, vol: 0.14 }); }
  busted() {
    if (!this.ctx) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) this.tone({ freq: 392 - i * 60, type: 'triangle', t: t + i * 0.16, dur: 0.15, vol: 0.12 });
  }
}
