// Lightweight WebAudio SFX for the TPP Arena — synthesized, no asset deps.
let ctx: AudioContext | null = null;
function ac(): AudioContext {
  if (!ctx) {
    const C = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

let masterGain: GainNode | null = null;
function master(): GainNode {
  const c = ac();
  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(c.destination);
  }
  return masterGain;
}

export function unlockAudio() {
  try { ac(); } catch { /* ignore */ }
}

/** Distance falloff helper. dist in meters. */
function distGain(dist: number, near = 4, far = 45) {
  if (dist <= near) return 1;
  if (dist >= far) return 0;
  return 1 - (dist - near) / (far - near);
}

export function playGunshot(dist = 0) {
  try {
    const c = ac();
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.connect(master());

    // Sharp transient — noise burst
    const buf = c.createBuffer(1, 2048, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    src.connect(bp).connect(g);

    // Low thump
    const osc = c.createOscillator();
    const og = c.createGain();
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.6, now + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(og).connect(g);

    const peak = 0.55 * distGain(dist);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    src.start(now);
    osc.start(now);
    src.stop(now + 0.2);
    osc.stop(now + 0.25);
    setTimeout(() => g.disconnect(), 350);
  } catch { /* ignore */ }
}

export function playReload() {
  try {
    const c = ac();
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.value = 0.25;
    g.connect(master());
    // two clicks: mag-out then mag-in
    const click = (t: number, freq: number) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = "square";
      o.frequency.value = freq;
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(og).connect(g);
      o.start(t); o.stop(t + 0.07);
    };
    click(now, 320);
    click(now + 0.55, 260);
    click(now + 1.7, 380);
    setTimeout(() => g.disconnect(), 2200);
  } catch { /* ignore */ }
}

export function playHit(dist = 0) {
  try {
    const c = ac();
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.value = 0.4 * distGain(dist);
    g.connect(master());
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.5, now + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    o.connect(og).connect(g);
    o.start(now); o.stop(now + 0.16);
    setTimeout(() => g.disconnect(), 200);
  } catch { /* ignore */ }
}

export function playDeath(dist = 0) {
  try {
    const c = ac();
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.value = 0.45 * distGain(dist);
    g.connect(master());
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.6);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.connect(og).connect(g);
    o.start(now); o.stop(now + 0.75);
    setTimeout(() => g.disconnect(), 850);
  } catch { /* ignore */ }
}

export function playFootstep() {
  try {
    const c = ac();
    const now = c.currentTime;
    const buf = c.createBuffer(1, 1024, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = c.createGain();
    g.gain.value = 0.18;
    src.connect(lp).connect(g).connect(master());
    src.start(now);
    setTimeout(() => g.disconnect(), 200);
  } catch { /* ignore */ }
}

export function playJump() {
  try {
    const c = ac();
    const now = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(380, now);
    o.frequency.exponentialRampToValueAtTime(560, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(g).connect(master());
    o.start(now); o.stop(now + 0.18);
    setTimeout(() => g.disconnect(), 220);
  } catch { /* ignore */ }
}
