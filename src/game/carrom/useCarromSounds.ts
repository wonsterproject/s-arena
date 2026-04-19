import { useCallback, useEffect, useRef } from "react";

// Synthesized Web Audio sounds for Carrom — no external assets needed.
export type CarromSound = "strike" | "collide" | "pocket" | "foul" | "win";

export function useCarromSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new Ctor();
    }
    return ctxRef.current!;
  }, []);

  const play = useCallback(
    (name: CarromSound) => {
      if (!enabled) return;
      const ctx = getCtx();
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;

      const tone = (
        freq: number,
        dur: number,
        type: OscillatorType,
        gain = 0.18,
        when = 0,
        freqEnd?: number,
      ) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, now + when);
        if (freqEnd !== undefined) {
          o.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + when + dur);
        }
        g.gain.setValueAtTime(0.0001, now + when);
        g.gain.exponentialRampToValueAtTime(gain, now + when + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + when + dur);
        o.connect(g).connect(ctx.destination);
        o.start(now + when);
        o.stop(now + when + dur + 0.02);
      };

      // Short noise burst (for pocket "thud" and strike "clack")
      const noise = (dur: number, gain = 0.15, when = 0, lowpass = 1200) => {
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filt = ctx.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = lowpass;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, now + when);
        g.gain.exponentialRampToValueAtTime(0.0001, now + when + dur);
        src.connect(filt).connect(g).connect(ctx.destination);
        src.start(now + when);
        src.stop(now + when + dur + 0.02);
      };

      if (name === "strike") {
        // Sharp wooden "clack" of striker hit
        noise(0.08, 0.35, 0, 2200);
        tone(420, 0.08, "square", 0.12);
      } else if (name === "collide") {
        // Coin-on-coin click
        tone(820, 0.05, "triangle", 0.12);
        noise(0.04, 0.18, 0, 3200);
      } else if (name === "pocket") {
        // Drop into pocket — descending bloop + thud
        tone(520, 0.18, "sine", 0.22, 0, 180);
        noise(0.14, 0.18, 0.05, 700);
      } else if (name === "foul") {
        tone(220, 0.16, "sawtooth", 0.18);
        tone(150, 0.22, "sawtooth", 0.16, 0.06);
      } else if (name === "win") {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => tone(f, 0.28, "triangle", 0.22, i * 0.13));
      }
    },
    [enabled, getCtx],
  );

  useEffect(() => () => { ctxRef.current?.close(); }, []);

  return play;
}
