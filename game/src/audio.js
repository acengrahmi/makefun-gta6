// Costa Verde — synthesized WebAudio: engine, sirens, shots, music. No audio files.
CV.audio = {
  ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
  musicOn: true, musicTimer: 0, musicStep: 0, started: false,
  init() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      // engine: sawtooth through a lowpass, gain follows driving state
      this.engineOsc = this.ctx.createOscillator(); this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 60;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master); this.engineOsc.start();
      // siren: triangle two-tone
      this.sirenOsc = this.ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master); this.sirenOsc.start();
      this.started = true;
    } catch (e) { /* audio unavailable — game stays silent */ }
  },
  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, dur = 0.14;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  },
  cash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1320].forEach((fr, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.3);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.32);
    });
  },
  update(dt, G) {
    if (!this.ctx) return;
    const driving = !!G.inCar, spd = driving ? Math.abs(G.car.speed) : 0;
    this.engineGain.gain.value = CV.lerp(this.engineGain.gain.value, driving ? 0.05 + spd * 0.0035 : 0, 0.2);
    this.engineOsc.frequency.value = 55 + spd * 6.5;
    const siren = G.wanted > 0 && !G.busted;
    this.sirenGain.gain.value = CV.lerp(this.sirenGain.gain.value, siren ? 0.028 : 0, 0.1);
    if (siren) this.sirenOsc.frequency.value = (Math.sin(performance.now() * 0.006) > 0) ? 720 : 540;
    // music: a lazy sunset arpeggio, scheduled from the step loop
    if (this.musicOn && G.started && !G.paused) {
      this.musicTimer -= dt;
      if (this.musicTimer <= 0) {
        this.musicTimer = 0.24;
        const scale = [220, 261.6, 329.6, 392, 329.6, 261.6, 196, 261.6];
        const fr = scale[this.musicStep % scale.length] * (this.musicStep % 16 >= 8 ? 1.5 : 1);
        this.musicStep++;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.055, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.32);
      }
    }
  },
};
