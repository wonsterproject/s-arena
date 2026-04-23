import { useCallback, useEffect, useRef } from "react";

export type SCSound = "thock" | "tick" | "twang" | "tok" | "win" | "foul" | "ui";

export function useStringCarromSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const getCtx = () => {
    if (!ctxRef.current) {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current!;
  };

  const play = useCallback((name: SCSound, intensity = 1) => {
    if (!enabledRef.current) return;
    if (!enabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;

    const tone = (freq: number, dur: number, type: OscillatorType, gain: number, attack = 0.005) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain * intensity, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    };
    const noise = (dur: number, freq: number, gain: number) => {
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.4);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass"; filt.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gain * intensity;
      src.connect(filt).connect(g).connect(ctx.destination);
      src.start(t0);
    };

    switch (name) {
      case "thock":
        tone(180, 0.13, "sine", 0.35);
        noise(0.08, 800, 0.18);
        break;
      case "tick":
        tone(900 + Math.random() * 300, 0.06, "triangle", 0.18);
        break;
      case "twang":
        tone(420, 0.22, "sawtooth", 0.18);
        tone(220, 0.18, "sine", 0.12);
        break;
      case "tok":
        tone(260, 0.08, "sine", 0.18);
        noise(0.05, 600, 0.10);
        break;
      case "win": {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle"; osc.frequency.value = f;
          g.gain.setValueAtTime(0, t0 + i * 0.12);
          g.gain.linearRampToValueAtTime(0.18, t0 + i * 0.12 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.4);
          osc.connect(g).connect(ctx.destination);
          osc.start(t0 + i * 0.12); osc.stop(t0 + i * 0.12 + 0.5);
        });
        break;
      }
      case "foul":
        tone(180, 0.18, "square", 0.16);
        tone(120, 0.22, "square", 0.12);
        break;
      case "ui":
        tone(700, 0.06, "sine", 0.10);
        break;
    }
  };

  useEffect(() => () => { ctxRef.current?.close(); }, []);
  return play;
}
