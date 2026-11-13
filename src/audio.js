// Tiny synthesized sound effects (no audio files needed).
let ctx, master, muted = false;
function ac() {
  if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noise(dur) {
  const c = ac(), b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = c.createBufferSource(); s.buffer = b; return s;
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }

export const sfx = {
  unlock() { ac(); },
  toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.7; return muted; },
  whoosh() {
    if (muted) return; const c = ac(), t = c.currentTime, n = noise(0.25), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.2);
    env(g, t, 0.03, 0.25, 0.2); n.connect(f).connect(g).connect(master); n.start(t);
  },
  hit(heavy) {
    if (muted) return; const c = ac(), t = c.currentTime;
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(heavy ? 140 : 190, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    env(og, t, 0.005, heavy ? 1.0 : 0.7, 0.2); o.connect(og).connect(master); o.start(t); o.stop(t + 0.3);
    const n = noise(0.18), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.value = heavy ? 2200 : 3200;
    env(g, t, 0.002, heavy ? 0.9 : 0.6, 0.12); n.connect(f).connect(g).connect(master); n.start(t);
  },
  block() {
    if (muted) return; const c = ac(), t = c.currentTime;
    for (const fr of [820, 1230, 2010]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = fr; env(g, t, 0.002, 0.08, 0.25); o.connect(g).connect(master); o.start(t); o.stop(t + 0.35); }
    const n = noise(0.08), g = c.createGain(); env(g, t, 0.001, 0.4, 0.07); n.connect(g).connect(master); n.start(t);
  },
  thud() {
    if (muted) return; const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); env(g, t, 0.01, 0.9, 0.45); o.connect(g).connect(master); o.start(t); o.stop(t + 0.5);
  },
  gong() {
    if (muted) return; const c = ac(), t = c.currentTime;
    for (const [fr, a] of [[110, 0.5], [165, 0.3], [233, 0.22], [347, 0.12]]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = fr; env(g, t, 0.01, a, 3.2); o.connect(g).connect(master); o.start(t); o.stop(t + 3.4); }
  },
};
