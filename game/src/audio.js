// Synthesized sound and music: every sound is built with WebAudio oscillators
// and noise — no audio files. Call ensure() from a user gesture first.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.musicOn = true;
    this.nextNoteTime = 0;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 28;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp); this.engineOsc2.connect(lp);
    lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
    // Police siren: alternating two-tone square wave.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.14;
    this.musicGain.connect(this.master);
    this.nextNoteTime = this.ctx.currentTime + 0.1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0.015, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 160, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(25 + speed01 * 80, t, 0.08);
  }

  setSiren(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.2);
    if (on) this.sirenOsc.frequency.setTargetAtTime((Math.floor(t * 2) % 2 === 0) ? 720 : 980, t, 0.05);
  }

  blip(freq, dur, type = 'sine', vol = 0.18) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  pickup() { this.blip(660, 0.12); setTimeout(() => this.blip(990, 0.18), 90); }
  cash() { this.blip(880, 0.1, 'triangle', 0.2); setTimeout(() => this.blip(1320, 0.22, 'triangle', 0.2), 80); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.22), i * 110)); }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.15), i * 160)); }
  horn() { this.blip(220, 0.25, 'square', 0.12); this.blip(277, 0.25, 'square', 0.12); }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.14;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = 0.5;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t);
    this.blip(90, 0.12, 'sine', 0.3);
  }

  thud() { this.blip(70, 0.2, 'sine', 0.3); }

  /** Schedule one step of the sunset-drive groove: bass + arpeggio over Am–F–C–G. */
  updateMusic() {
    if (!this.ctx || !this.musicOn || this.muted) return;
    const chords = [[110, 130.8, 164.8], [87.3, 130.8, 174.6], [130.8, 164.8, 196], [98, 146.8, 196]];
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const step = this.musicStep;
      const bar = Math.floor(step / 8) % 4;
      const chord = chords[bar];
      const t = this.nextNoteTime;
      if (step % 8 === 0) this.note(chord[0] / 2, t, 0.9, 'triangle', 0.22);
      if (step % 4 === 2) this.note(chord[0], t, 0.4, 'sine', 0.1);
      const arp = chord[(step * 2 + bar) % 3] * 2;
      this.note(arp, t, 0.22, 'sine', 0.07);
      if (step % 2 === 1) this.hat(t);
      this.nextNoteTime += 0.21;
      this.musicStep += 1;
    }
  }

  note(freq, t, dur, type, vol) {
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  hat(t) {
    const len = this.ctx.sampleRate * 0.04;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    src.connect(hp); hp.connect(g); g.connect(this.musicGain);
    src.start(t);
  }
}
