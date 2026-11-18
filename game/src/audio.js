// Costa Verde — synthesized WebAudio: engine, shots, sirens, pickup chimes, music.
// Everything is generated; there are no audio files. All calls are safe before
// the first user gesture (the context simply stays suspended).
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});

  const A = {
    ctx: null, master: null, musicOn: true, engineOsc: null, engineGain: null,
    sirenOsc: null, sirenGain: null, musicTimer: 0, musicStep: 0,
  };

  A.init = () => {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    try {
      A.ctx = new (window.AudioContext || window.webkitAudioContext)();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.5;
      A.master.connect(A.ctx.destination);
      // Engine: a sawtooth whose pitch follows speed.
      A.engineOsc = A.ctx.createOscillator();
      A.engineOsc.type = 'sawtooth';
      A.engineGain = A.ctx.createGain();
      A.engineGain.gain.value = 0;
      const lp = A.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700;
      A.engineOsc.connect(lp); lp.connect(A.engineGain); A.engineGain.connect(A.master);
      A.engineOsc.start();
      // Siren: a slow two-tone LFO'd square, gain driven by wanted level.
      A.sirenOsc = A.ctx.createOscillator();
      A.sirenOsc.type = 'triangle';
      A.sirenGain = A.ctx.createGain();
      A.sirenGain.gain.value = 0;
      A.sirenOsc.connect(A.sirenGain); A.sirenGain.connect(A.master);
      A.sirenOsc.start();
    } catch (e) { A.ctx = null; }
  };

  const env = (gain, t0, peak, dur) => {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };

  A.shot = () => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const src = A.ctx.createBufferSource();
    const len = Math.floor(A.ctx.sampleRate * 0.14);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const g = A.ctx.createGain(); env(g, t, 0.5, 0.16);
    const f = A.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 500;
    src.connect(f); f.connect(g); g.connect(A.master); src.start();
  };

  A.blip = (freq, dur, peak, type) => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    const g = A.ctx.createGain(); env(g, t, peak || 0.22, dur || 0.18);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + (dur || 0.18) + 0.05);
  };
  A.cash = () => { A.blip(880, 0.12, 0.2); setTimeout(() => A.blip(1318, 0.2, 0.2), 70); };
  A.busted = () => { A.blip(220, 0.5, 0.3, 'square'); setTimeout(() => A.blip(165, 0.7, 0.3, 'square'), 160); };
  A.checkpoint = () => A.blip(1046, 0.16, 0.22);

  // Called every frame from the game loop with live state.
  A.update = (dt, st) => {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    if (A.engineGain) {
      const target = st.driving ? 0.05 + Math.min(0.06, Math.abs(st.speed) * 0.002) : 0.0;
      A.engineGain.gain.setTargetAtTime(target, t, 0.08);
      A.engineOsc.frequency.setTargetAtTime(55 + Math.abs(st.speed) * 3.4, t, 0.08);
    }
    if (A.sirenGain) {
      const near = st.wanted > 0 && st.copNear;
      A.sirenGain.gain.setTargetAtTime(near ? 0.035 : 0.0, t, 0.2);
      if (near) A.sirenOsc.frequency.setTargetAtTime(660 + Math.sin(t * 5.2) * 190, t, 0.05);
    }
    // Music: a slow sunset pad progression (Am – F – C – G), one chord per 2.4 s.
    if (A.musicOn) {
      A.musicTimer -= dt;
      if (A.musicTimer <= 0) {
        A.musicTimer = 2.4;
        const chords = [[110, 164.8, 261.6], [87.3, 174.6, 220], [130.8, 196, 261.6], [98, 196, 246.9]];
        const ch = chords[A.musicStep++ % chords.length];
        for (const f of ch) {
          const o = A.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const g = A.ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.045, t + 0.4);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 2.35);
          o.connect(g); g.connect(A.master); o.start(t); o.stop(t + 2.4);
        }
      }
    }
  };

  A.toggleMusic = () => { A.musicOn = !A.musicOn; return A.musicOn; };
  CV.audio = A;
})();
