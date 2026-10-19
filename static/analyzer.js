// Beetzw analyzer: stima BPM e tonalità di un file audio, tutto nel browser.
// BPM: spectral flux -> autocorrelazione con prior attorno ai 120 bpm.
// Key: cromagramma -> correlazione con i profili di Krumhansl-Schmuckler.
(function () {
  const SR = 22050;
  const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  const hann = (n) => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));

  async function decode(arrayBuffer) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();
    // Analizza al massimo 2 minuti, saltando un eventuale intro.
    const start = buf.duration > 60 ? Math.min(30, buf.duration * 0.1) : 0;
    const dur = Math.min(120, buf.duration - start);
    const off = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start(0, start, dur);
    const rendered = await off.startRendering();
    return { samples: rendered.getChannelData(0), duration: buf.duration };
  }

  // ---- BPM ----
  function onsetEnvelope(x) {
    const N = 1024, H = 256, win = hann(N), half = N / 2;
    const frames = Math.floor((x.length - N) / H);
    const env = new Float32Array(Math.max(frames, 0));
    let prev = new Float32Array(half);
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < N; i++) { re[i] = x[f * H + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const cur = new Float32Array(half);
      let flux = 0;
      for (let k = 1; k < half; k++) {
        cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
        const d = cur[k] - prev[k];
        if (d > 0) flux += d;
      }
      env[f] = flux;
      prev = cur;
    }
    // Rimuove la media locale (~0.5s) e tiene solo la parte positiva.
    const w = 43, out = new Float32Array(env.length);
    let acc = 0;
    for (let i = 0; i < env.length; i++) {
      acc += env[i];
      if (i >= w) acc -= env[i - w];
      out[i] = Math.max(0, env[i] - acc / Math.min(i + 1, w));
    }
    return { env: out, fps: SR / H };
  }

  function estimateBpm(env, fps) {
    const maxLag = Math.min(env.length - 1, Math.ceil(fps) * 16 + 2);
    const acf = new Float32Array(maxLag + 1);
    for (let l = 0; l <= maxLag; l++) {
      let s = 0;
      for (let i = 0; i + l < env.length; i++) s += env[i] * env[i + l];
      acf[l] = s / (env.length - l);
    }
    const at = (lag) => {
      const i = Math.floor(lag), t = lag - i;
      return i + 1 > maxLag ? 0 : acf[i] * (1 - t) + acf[i + 1] * t;
    };
    // Somma dell'autocorrelazione sui multipli del periodo: più stabile e più precisa.
    const score = (bpm) => {
      const p = (60 * fps) / bpm;
      return at(p) + 0.5 * at(2 * p) + 0.25 * at(4 * p);
    };
    const prior = (bpm) => Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));

    let best = 120, bestS = -Infinity;
    for (let bpm = 60; bpm <= 200; bpm += 0.5) {
      const s = score(bpm) * prior(bpm);
      if (s > bestS) { bestS = s; best = bpm; }
    }
    // Rifinitura: i multipli lontani del periodo rendono visibili errori di pochi centesimi.
    const fine = (bpm) => {
      const p = (60 * fps) / bpm;
      let s = 0;
      for (let m = 1; m * p < maxLag; m++) s += at(m * p);
      return s;
    };
    let coarse = best, fineS = -Infinity;
    for (let bpm = coarse - 1; bpm <= coarse + 1; bpm += 0.01) {
      const s = fine(bpm);
      if (s > fineS) { fineS = s; best = bpm; }
    }
    // I brani prodotti hanno quasi sempre BPM interi: arrotonda se è vicino.
    const r = Math.round(best);
    return Math.abs(best - r) < 0.25 ? r : Math.round(best * 10) / 10;
  }

  // ---- Key ----
  function chroma(x) {
    const N = 8192, H = 2048, win = hann(N);
    const re = new Float32Array(N), im = new Float32Array(N);
    const map = new Int8Array(N / 2).fill(-1);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * SR) / N;
      if (f < 60 || f > 4500) continue;
      map[k] = ((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12;
    }
    const c = new Float64Array(12);
    for (let s = 0; s + N <= x.length; s += H) {
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const frame = new Float64Array(12);
      let tot = 0;
      for (let k = 1; k < N / 2; k++) {
        if (map[k] < 0) continue;
        const m = Math.hypot(re[k], im[k]);
        frame[map[k]] += m; tot += m;
      }
      if (tot > 1e-6) for (let p = 0; p < 12; p++) c[p] += frame[p] / tot;
    }
    return Array.from(c);
  }

  function corr(a, b) {
    const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < 12; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db || 1);
  }

  function estimateKey(c) {
    const ranked = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      const rot = () => c.map((_, i) => c[(i + tonic) % 12]);
      ranked.push({ tonic, mode: "major", r: corr(rot(), MAJOR) });
      ranked.push({ tonic, mode: "minor", r: corr(rot(), MINOR) });
    }
    ranked.sort((a, b) => b.r - a.r);
    return ranked;
  }

  function camelot(tonic, mode) {
    const majorPc = mode === "major" ? tonic : (tonic + 3) % 12;
    return (((majorPc * 7) % 12 + 7) % 12 + 1) + (mode === "major" ? "B" : "A");
  }
  const keyName = (k) => NOTES[k.tonic] + (k.mode === "minor" ? "m" : "");
  const keyLong = (k) => NOTES[k.tonic] + (k.mode === "minor" ? " minore" : " maggiore");

  async function analyze(arrayBuffer, onStep = () => {}) {
    onStep("Decodifico l'audio…");
    await tick();
    const { samples, duration } = await decode(arrayBuffer);
    onStep("Calcolo il tempo…");
    await tick();
    const { env, fps } = onsetEnvelope(samples);
    const bpm = estimateBpm(env, fps);
    onStep("Cerco la tonalità…");
    await tick();
    const c = chroma(samples);
    const ranked = estimateKey(c);
    const best = ranked[0];
    const steps = best.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const inScale = new Set(steps.map((s) => (best.tonic + s) % 12));
    return {
      bpm,
      duration,
      key: { name: keyName(best), long: keyLong(best), camelot: camelot(best.tonic, best.mode) },
      alt: { name: keyName(ranked[1]), camelot: camelot(ranked[1].tonic, ranked[1].mode) },
      confidence: best.r - ranked[1].r,
      chroma: c.map((v) => v / Math.max(...c)),
      inScale,
      notes: NOTES,
    };
  }

  window.BeetzwAnalyzer = { analyze };
})();
