import { useEffect, useRef } from "react";

/**
 * Full-screen REAL burning-coal background.
 * Uses the user-provided realistic 3D ludo board image as the base layer
 * (the image already contains the molten coal, glass home zones, gem path
 * and broken stones). On top we paint live animated fire, embers, heat
 * shimmer and pulsing glow on a canvas so it actually looks alive.
 */

import boardBg from "@/assets/ludo-board-realistic.png";

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

export function LavaBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const embers: Ember[] = [];
    const MAX_EMBERS = 90;

    const spawn = () => {
      embers.push({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.6 + Math.random() * 1.6),
        life: 0,
        maxLife: 120 + Math.random() * 220,
        size: 0.8 + Math.random() * 2.2,
        hue: 18 + Math.random() * 22,
      });
    };

    let t = 0;
    const render = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // Pulsing global heat tint (orange/red breathing)
      const pulse = 0.08 + Math.sin(t * 0.012) * 0.04;
      ctx.fillStyle = `hsla(15, 90%, 35%, ${pulse})`;
      ctx.fillRect(0, 0, w, h);

      // Soft hot-spot lights drifting across the board
      const drift = t * 0.0015;
      for (let i = 0; i < 3; i++) {
        const cx = (Math.sin(drift + i * 1.7) * 0.4 + 0.5) * w;
        const cy = (Math.cos(drift * 1.3 + i * 2.1) * 0.4 + 0.5) * h;
        const r = Math.min(w, h) * (0.18 + 0.05 * Math.sin(t * 0.02 + i));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `hsla(${20 + i * 6}, 95%, 55%, 0.18)`);
        grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Spawn embers
      if (embers.length < MAX_EMBERS && Math.random() < 0.6) spawn();
      if (embers.length < MAX_EMBERS && Math.random() < 0.6) spawn();

      // Update and draw embers
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life += 1;
        e.x += e.vx + Math.sin((e.y + t) * 0.02) * 0.3;
        e.y += e.vy;
        e.vy *= 0.998;
        const lifeRatio = e.life / e.maxLife;
        if (lifeRatio >= 1 || e.y < -10) {
          embers.splice(i, 1);
          continue;
        }
        const alpha = (1 - lifeRatio) * 0.95;
        const size = e.size * (1 - lifeRatio * 0.4);
        // glow
        const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, size * 8);
        glow.addColorStop(0, `hsla(${e.hue}, 100%, 70%, ${alpha * 0.7})`);
        glow.addColorStop(0.4, `hsla(${e.hue - 5}, 100%, 50%, ${alpha * 0.25})`);
        glow.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(e.x, e.y, size * 8, 0, Math.PI * 2);
        ctx.fill();
        // hot core
        ctx.fillStyle = `hsla(${e.hue + 15}, 100%, 85%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle flame licks at the edges (top + sides)
      const flameCount = 18;
      for (let i = 0; i < flameCount; i++) {
        const fx = (i / flameCount) * w + Math.sin(t * 0.04 + i) * 18;
        const baseY = h;
        const flameH = 60 + Math.sin(t * 0.06 + i * 1.3) * 30 + Math.random() * 20;
        const flameW = 40 + Math.sin(t * 0.05 + i) * 15;
        const grad = ctx.createLinearGradient(fx, baseY, fx, baseY - flameH);
        grad.addColorStop(0, "hsla(20, 100%, 55%, 0.55)");
        grad.addColorStop(0.5, "hsla(15, 100%, 50%, 0.25)");
        grad.addColorStop(1, "hsla(0, 80%, 30%, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(fx, baseY - flameH * 0.4, flameW, flameH, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Top edge flames (image already has fire at top — we add subtle glow)
      const topGrad = ctx.createLinearGradient(0, 0, 0, 120);
      topGrad.addColorStop(0, "hsla(18, 100%, 50%, 0.18)");
      topGrad.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, w, 120);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="fixed inset-0 -z-20 overflow-hidden pointer-events-none">
      {/* Realistic 3D coal+glass+stone reference image as base layer */}
      <img
        src={boardBg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: "saturate(1.1) contrast(1.05)",
        }}
      />
      {/* Subtle slow zoom/breathe to make coal feel alive */}
      <div
        className="absolute inset-0 animate-coal-breathe"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 40%, hsl(0 0% 0% / 0.35) 100%)",
        }}
      />
      {/* Live fire + embers + heat shimmer */}
      <canvas ref={canvasRef} className="absolute inset-0 mix-blend-screen" />
      {/* Final vignette for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, hsl(0 0% 0% / 0.55) 100%)",
        }}
      />
    </div>
  );
}
