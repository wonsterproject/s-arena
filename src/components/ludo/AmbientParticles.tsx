import { useMemo } from "react";

/** Subtle floating neon particles for the match background. */
export function AmbientParticles({ count = 18 }: { count?: number }) {
  const particles = useMemo(() => {
    const colors = ["hsl(280 95% 65%)", "hsl(200 100% 60%)", "hsl(45 100% 60%)", "hsl(140 75% 55%)", "hsl(0 90% 60%)"];
    return Array.from({ length: count }).map((_, i) => {
      const size = 3 + Math.random() * 5;
      const left = Math.random() * 100;
      const dur = 14 + Math.random() * 16;
      const delay = -Math.random() * dur;
      const color = colors[i % colors.length];
      return { size, left, dur, delay, color, key: i };
    });
  }, [count]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute bottom-[-20px] rounded-full animate-float-particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
