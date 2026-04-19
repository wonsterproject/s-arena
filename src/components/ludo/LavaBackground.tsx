import { useEffect, useRef } from "react";

/**
 * Surrounding live-fire ambience BEHIND the board.
 * The board itself already shows the realistic 3D coal+glass image,
 * so this layer only adds a deeper coal field around it with rising
 * embers, drifting heat hot-spots and flame licks at the bottom edge,
 * making the whole screen feel like one continuous burning environment.
 */
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

    interface Ember {
      x: number; y: number; vx: number; vy: number;
      life: number; maxLife: number; size: number; hue: number;
    }
    const embers: Ember[] = [];
    const MAX_EMBERS = 110;

    const spawn = () => {
      embers.push({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(0.6 + Math.random() * 1.8),
        life: 0,
        maxLife: 140 + Math.random() * 240,
        size: 0.8 + Math.random() * 2.4,
        hue: 18 + Math.random() * 22,
      });
    };

    let t = 0;
    const render = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // Drifting hot-spot lights
      const drift = t * 0.0015;
      for (let i = 0; i < 4; i++) {
        const cx = (Math.sin(drift + i * 1.7) * 0.45 + 0.5) * w;
        const cy = (Math.cos(drift * 1.3 + i * 2.1) * 0.45 + 0.5) * h;
        const r = Math.min(w, h) * (0.22 + 0.06 * Math.sin(t * 0.02 + i));
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `hsla(${18 + i * 5}, 95%, 55%, 0.22)`);
        grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Embers
      if (embers.length < MAX_EMBERS && Math.random() < 0.7) spawn();
      if (embers.length < MAX_EMBERS && Math.random() < 0.7) spawn();
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life += 1;
        e.x += e.vx + Math.sin((e.y + t) * 0.02) * 0.35;
        e.y += e.vy;
        e.vy *= 0.998;
        const lifeRatio = e.life / e.maxLife;
        if (lifeRatio >= 1 || e.y < -10) { embers.splice(i, 1); continue; }
        const alpha = (1 - lifeRatio) * 0.95;
        const size = e.size * (1 - lifeRatio * 0.4);
        const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, size * 9);
        glow.addColorStop(0, `hsla(${e.hue}, 100%, 70%, ${alpha * 0.75})`);
        glow.addColorStop(0.4, `hsla(${e.hue - 5}, 100%, 50%, ${alpha * 0.3})`);
        glow.addColorStop(1, "hsla(0,0%,0%,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(e.x, e.y, size * 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${e.hue + 15}, 100%, 88%, ${alpha})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, size, 0, Math.PI * 2); ctx.fill();
      }

      // Bottom flame licks
      const flameCount = 22;
      for (let i = 0; i < flameCount; i++) {
        const fx = (i / flameCount) * w + Math.sin(t * 0.04 + i) * 22;
        const baseY = h;
        const flameH = 70 + Math.sin(t * 0.06 + i * 1.3) * 35 + Math.random() * 20;
        const flameW = 50 + Math.sin(t * 0.05 + i) * 18;
        const grad = ctx.createLinearGradient(fx, baseY, fx, baseY - flameH);
        grad.addColorStop(0, "hsla(20, 100%, 55%, 0.5)");
        grad.addColorStop(0.5, "hsla(15, 100%, 50%, 0.22)");
        grad.addColorStop(1, "hsla(0, 80%, 30%, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(fx, baseY - flameH * 0.4, flameW, flameH, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Top edge fire glow
      const topGrad = ctx.createLinearGradient(0, 0, 0, 140);
      topGrad.addColorStop(0, "hsla(18, 100%, 50%, 0.22)");
      topGrad.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, w, 140);

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
      {/* Deep coal field — extends the board's burning environment to full screen */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, hsl(15 70% 14%), transparent 50%)," +
            "radial-gradient(ellipse at 70% 80%, hsl(8 80% 10%), transparent 55%)," +
            "radial-gradient(ellipse at 50% 50%, hsl(20 60% 8%), hsl(0 70% 4%) 70%)," +
            "linear-gradient(160deg, hsl(15 50% 5%), hsl(0 60% 3%) 60%, hsl(20 70% 5%))",
        }}
      />
      {/* Glowing coal crackle pattern */}
      <div
        className="absolute inset-0 opacity-60 animate-coal-breathe"
        style={{
          backgroundImage: `
            radial-gradient(circle at 20% 30%, hsl(20 100% 50% / 0.45) 0px, transparent 4px),
            radial-gradient(circle at 60% 70%, hsl(15 100% 55% / 0.4) 0px, transparent 5px),
            radial-gradient(circle at 80% 20%, hsl(25 100% 60% / 0.35) 0px, transparent 3px),
            radial-gradient(circle at 35% 85%, hsl(18 100% 55% / 0.4) 0px, transparent 5px),
            radial-gradient(circle at 90% 60%, hsl(22 100% 50% / 0.35) 0px, transparent 4px),
            radial-gradient(circle at 10% 70%, hsl(15 100% 50% / 0.4) 0px, transparent 4px),
            radial-gradient(circle at 50% 10%, hsl(20 100% 55% / 0.3) 0px, transparent 3px)
          `,
          backgroundSize: "180px 180px, 220px 220px, 150px 150px, 200px 200px, 170px 170px, 190px 190px, 160px 160px",
        }}
      />
      {/* Live fire + embers + heat */}
      <canvas ref={canvasRef} className="absolute inset-0 mix-blend-screen" />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, hsl(0 0% 0% / 0.6) 100%)",
        }}
      />
    </div>
  );
}
