import { useCallback, useEffect, useRef } from "react";

// Web Audio synthesized sounds (no external assets)
type SoundName = "dice" | "move" | "kill" | "win";

export function useSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctxRef.current = new Ctor();
    }
    return ctxRef.current!;
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled) return;
      const ctx = getCtx();
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const now = ctx.currentTime;

      const tone = (freq: number, dur: number, type: OscillatorType, gain = 0.18, when = 0) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now + when);
        g.gain.exponentialRampToValueAtTime(gain, now + when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + when + dur);
        o.connect(g).connect(ctx.destination);
        o.start(now + when);
        o.stop(now + when + dur + 0.02);
      };

      if (name === "dice") {
        for (let i = 0; i < 6; i++) {
          tone(180 + Math.random() * 240, 0.06, "square", 0.12, i * 0.06);
        }
      } else if (name === "move") {
        tone(660, 0.08, "triangle", 0.15);
      } else if (name === "kill") {
        tone(220, 0.18, "sawtooth", 0.22);
        tone(110, 0.25, "sawtooth", 0.18, 0.05);
      } else if (name === "win") {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => tone(f, 0.25, "triangle", 0.2, i * 0.12));
      }
    },
    [enabled, getCtx]
  );

  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  return play;
}
