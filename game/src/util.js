// Costa Verde — shared utilities: math, RNG, DOM helpers, canvas textures.
(function () {
  'use strict';
  const CV = (window.CV = window.CV || {});

  CV.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  CV.lerp = (a, b, t) => a + (b - a) * t;
  CV.dist2 = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  CV.dist = (ax, az, bx, bz) => Math.sqrt(CV.dist2(ax, az, bx, bz));
  CV.angLerp = (a, b, t) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  // Deterministic RNG so screenshots and playtests are reproducible.
  CV.rng = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };
  CV.rand = (r, a, b) => a + r() * (b - a);
  CV.pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  CV.el = (id) => document.getElementById(id);
  CV.fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

  // A canvas texture drawn by a callback — used for windows, billboards, glows.
  CV.canvasTexture = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  };

  // Building facade: rows of windows, some warmly lit, over a base colour.
  CV.facadeTexture = (base, litRatio, seed, cols, rows) => {
    const r = CV.rng(seed);
    return CV.canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const cw = w / cols, ch = h / rows;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const lit = r() < litRatio;
          g.fillStyle = lit
            ? `rgb(${235 + Math.floor(r() * 20)},${175 + Math.floor(r() * 40)},${90 + Math.floor(r() * 40)})`
            : `rgb(${38 + Math.floor(r() * 22)},${34 + Math.floor(r() * 18)},${48 + Math.floor(r() * 22)})`;
          g.fillRect(x * cw + cw * 0.22, y * ch + ch * 0.24, cw * 0.56, ch * 0.5);
        }
      }
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, h - 10, w, 10);
    });
  };

  // A billboard / neon sign with readable words.
  CV.signTexture = (word, sub, bg, fg, seed) =>
    CV.canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(7, 7, w - 14, h - 14);
      g.fillStyle = fg;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 44px Arial, sans-serif';
      g.fillText(word, w / 2, sub ? h / 2 - 16 : h / 2);
      if (sub) {
        g.font = 'bold 21px Arial, sans-serif';
        g.fillText(sub, w / 2, h / 2 + 30);
      }
    });

  // Soft radial glow sprite texture (sun halo, light pools, markers).
  CV.glowTexture = (inner, outer) =>
    CV.canvasTexture(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      gr.addColorStop(0, inner);
      gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
})();
