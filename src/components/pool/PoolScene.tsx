import { useEffect, useRef, useState } from "react";
import { TABLE, BALL, POCKETS, BALL_COLORS } from "@/game/pool/constants";
import type { Ball } from "@/game/pool/types";

interface Props {
  balls: Ball[];
  interactive: boolean;
  ballInHand: boolean;
  onShoot: (dirX: number, dirZ: number, power: number) => void;
  onPlaceCue: (x: number, z: number) => void;
  ghostHint?: { dx: number; dz: number } | null;
}

function worldToCanvas(x: number, z: number, w: number, h: number) {
  const px = ((x + TABLE.halfW) / (TABLE.width)) * w;
  const py = ((z + TABLE.halfH) / (TABLE.height)) * h;
  return { px, py };
}

function canvasToWorld(px: number, py: number, w: number, h: number) {
  const x = (px / w) * TABLE.width - TABLE.halfW;
  const z = (py / h) * TABLE.height - TABLE.halfH;
  return { x, z };
}

// Ray-circle intersection in world space.
// Returns nearest t>0 along ray (origin + t*dir) where ray (radius=BALL.radius) hits target ball,
// plus the hit ball and ghost-ball center (cue center at moment of contact).
function predictFirstHit(
  ox: number, oz: number, ux: number, uz: number,
  balls: Ball[],
): { t: number; ball: Ball; ghostX: number; ghostZ: number } | null {
  const r2 = (BALL.radius * 2);
  let best: { t: number; ball: Ball; ghostX: number; ghostZ: number } | null = null;
  for (const b of balls) {
    if (b.id === 0 || b.pocketed) continue;
    const ex = b.x - ox, ez = b.z - oz;
    const proj = ex * ux + ez * uz;
    if (proj <= 0) continue;
    const perp2 = (ex * ex + ez * ez) - proj * proj;
    if (perp2 > r2 * r2) continue;
    const back = Math.sqrt(r2 * r2 - perp2);
    const t = proj - back;
    if (t <= 0) continue;
    if (!best || t < best.t) {
      best = { t, ball: b, ghostX: ox + ux * t, ghostZ: oz + uz * t };
    }
  }
  return best;
}

export default function PoolScene({ balls, interactive, ballInHand, onShoot, onPlaceCue, ghostHint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [aim, setAim] = useState<{ dx: number; dz: number } | null>(null);
  const [power, setPower] = useState(0);
  const [draggingCue, setDraggingCue] = useState(false);
  const powerRef = useRef(power);
  const aimRef = useRef(aim);
  useEffect(() => { powerRef.current = power; }, [power]);
  useEffect(() => { aimRef.current = aim; }, [aim]);

  // Reset power when interactivity ends (shot taken)
  useEffect(() => { if (!interactive) setPower(0); }, [interactive]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = w / 2;
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    c.style.width = size.w + "px";
    c.style.height = size.h + "px";
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Felt
    const feltGrad = ctx.createRadialGradient(size.w / 2, size.h / 2, size.w * 0.1, size.w / 2, size.h / 2, size.w * 0.7);
    feltGrad.addColorStop(0, "#0e6b3a");
    feltGrad.addColorStop(1, "#053f1f");
    ctx.fillStyle = feltGrad;
    ctx.fillRect(0, 0, size.w, size.h);

    // Rails
    const railPx = (TABLE.cushionInset / TABLE.width) * size.w;
    ctx.fillStyle = "#5a2a0a";
    ctx.fillRect(0, 0, size.w, railPx);
    ctx.fillRect(0, size.h - railPx, size.w, railPx);
    ctx.fillRect(0, 0, railPx, size.h);
    ctx.fillRect(size.w - railPx, 0, railPx, size.h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(railPx, railPx, size.w - 2 * railPx, size.h - 2 * railPx);

    // Pockets
    for (const p of POCKETS) {
      const { px, py } = worldToCanvas(p.x, p.z, size.w, size.h);
      const pr = (p.r / TABLE.width) * size.w;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Head string
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const headX = ((-TABLE.halfW * 0.5 + TABLE.halfW) / TABLE.width) * size.w;
    ctx.beginPath();
    ctx.moveTo(headX, railPx);
    ctx.lineTo(headX, size.h - railPx);
    ctx.stroke();
    ctx.setLineDash([]);

    const cue = balls.find(b => b.id === 0);
    const activeAim = aim ?? ghostHint ? { dx: (aim ?? ghostHint!).dx, dz: (aim ?? ghostHint!).dz } : null;

    // Aim & prediction
    if (cue && !cue.pocketed && interactive && activeAim) {
      const len = Math.hypot(activeAim.dx, activeAim.dz) || 1;
      const ux = activeAim.dx / len, uz = activeAim.dz / len;
      const { px: cpx, py: cpy } = worldToCanvas(cue.x, cue.z, size.w, size.h);
      const ballRpx = (BALL.radius / TABLE.width) * size.w;

      // Predict first hit
      const hit = predictFirstHit(cue.x, cue.z, ux, uz, balls);
      const maxLen = Math.hypot(size.w, size.h);
      const endT = hit ? hit.t : TABLE.width * 2;
      const endWX = cue.x + ux * endT;
      const endWZ = cue.z + uz * endT;
      const { px: ex, py: ey } = worldToCanvas(endWX, endWZ, size.w, size.h);

      // Dotted line from cue to hit (or far away)
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(cpx + ux * ballRpx, cpy + uz * ballRpx);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hit) {
        // Ghost ball circle at impact point
        const { px: gx, py: gy } = worldToCanvas(hit.ghostX, hit.ghostZ, size.w, size.h);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(gx, gy, ballRpx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Predicted target ball direction: from ghost-ball center → target ball center
        const tx = hit.ball.x - hit.ghostX;
        const tz = hit.ball.z - hit.ghostZ;
        const tlen = Math.hypot(tx, tz) || 1;
        const tux = tx / tlen, tuz = tz / tlen;
        const { px: bpx, py: bpy } = worldToCanvas(hit.ball.x, hit.ball.z, size.w, size.h);
        const projLen = size.w * 0.35;
        const epx = bpx + tux * projLen;
        const epy = bpy + tuz * projLen;
        // Color matches target ball
        const col = BALL_COLORS[hit.ball.id] ?? "#fff";
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(bpx + tux * ballRpx, bpy + tuz * ballRpx);
        ctx.lineTo(epx, epy);
        ctx.stroke();
        ctx.setLineDash([]);
        // Arrow head
        const ah = 8;
        const angle = Math.atan2(tuz, tux);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(epx, epy);
        ctx.lineTo(epx - ah * Math.cos(angle - 0.4), epy - ah * Math.sin(angle - 0.4));
        ctx.lineTo(epx - ah * Math.cos(angle + 0.4), epy - ah * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Balls
    for (const b of balls) {
      if (b.pocketed) continue;
      const { px, py } = worldToCanvas(b.x, b.z, size.w, size.h);
      const r = (BALL.radius / TABLE.width) * size.w;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2, r, 0, Math.PI * 2);
      ctx.fill();
      const color = BALL_COLORS[b.id] ?? "#fff";
      if (b.kind === "stripe") {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const hl = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, 0, px, py, r);
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(0.6, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      if (b.id !== 0) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(px, py, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = `bold ${Math.max(8, r * 0.7)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(b.id), px, py + 0.5);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // CUE STICK — drawn behind cue ball, opposite the aim direction.
    // Pulls back as power increases.
    if (cue && !cue.pocketed && interactive && activeAim) {
      const len = Math.hypot(activeAim.dx, activeAim.dz) || 1;
      const ux = activeAim.dx / len, uz = activeAim.dz / len;
      const { px: cpx, py: cpy } = worldToCanvas(cue.x, cue.z, size.w, size.h);
      const ballRpx = (BALL.radius / TABLE.width) * size.w;
      const stickLen = size.w * 0.42;
      const pullback = ballRpx * 0.6 + power * ballRpx * 5; // grows with power
      const tipX = cpx - ux * (ballRpx + pullback);
      const tipY = cpy - uz * (ballRpx + pullback);
      const buttX = tipX - ux * stickLen;
      const buttY = tipY - uz * stickLen;
      // Perpendicular for thickness
      const perpX = -uz, perpY = ux;
      const tipW = ballRpx * 0.22;
      const buttW = ballRpx * 0.55;
      // Stick body (gradient wood)
      const grad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
      grad.addColorStop(0, "#f0f0f0");      // ferrule near tip
      grad.addColorStop(0.04, "#1a1a1a");   // tip black band
      grad.addColorStop(0.08, "#e8d5a8");   // shaft start
      grad.addColorStop(0.6, "#b8895a");    // wood mid
      grad.addColorStop(1, "#3a1f0a");      // dark butt
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(tipX + perpX * tipW, tipY + perpY * tipW);
      ctx.lineTo(buttX + perpX * buttW, buttY + perpY * buttW);
      ctx.lineTo(buttX - perpX * buttW, buttY - perpY * buttW);
      ctx.lineTo(tipX - perpX * tipW, tipY - perpY * tipW);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Tip cushion (blue)
      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.arc(tipX, tipY, tipW * 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [balls, size, aim, ghostHint, interactive, power]);

  function getPointerWorld(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return canvasToWorld(px, py, size.w, size.h);
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const w = getPointerWorld(e);
    const cue = balls.find(b => b.id === 0);
    if (!cue) return;
    if (ballInHand) {
      setDraggingCue(true);
      onPlaceCue(w.x, w.z);
      return;
    }
    const dx = w.x - cue.x;
    const dz = w.z - cue.z;
    setAim({ dx, dz });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive) return;
    const w = getPointerWorld(e);
    if (draggingCue) {
      onPlaceCue(w.x, w.z);
      return;
    }
    if (aim) {
      const cue = balls.find(b => b.id === 0);
      if (!cue) return;
      setAim({ dx: w.x - cue.x, dz: w.z - cue.z });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!interactive) return;
    (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    setDraggingCue(false);
  };

  // ===== Vertical power slider — drag down = more power, release = shoot =====
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [sliderDragging, setSliderDragging] = useState(false);

  const updatePowerFromY = (clientY: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height; // 0 top, 1 bottom
    const p = Math.max(0, Math.min(1, ratio));
    setPower(p);
  };

  const onSliderDown = (e: React.PointerEvent) => {
    if (!interactive || !aimRef.current) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setSliderDragging(true);
    updatePowerFromY(e.clientY);
  };
  const onSliderMove = (e: React.PointerEvent) => {
    if (!sliderDragging) return;
    updatePowerFromY(e.clientY);
  };
  const onSliderUp = (e: React.PointerEvent) => {
    if (!sliderDragging) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    setSliderDragging(false);
    const a = aimRef.current;
    const p = powerRef.current;
    if (a && p > 0.05 && interactive) {
      onShoot(a.dx, a.dz, p);
    } else {
      setPower(0);
    }
  };

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="block w-full rounded-2xl ring-1 ring-white/10 touch-none cursor-crosshair"
        style={{ background: "#053f1f" }}
      />

      {interactive && (
        <>
          {/* Vertical power slider on the right edge */}
          <div
            ref={sliderRef}
            onPointerDown={onSliderDown}
            onPointerMove={onSliderMove}
            onPointerUp={onSliderUp}
            onPointerCancel={onSliderUp}
            className="absolute right-2 top-2 bottom-2 w-12 rounded-2xl bg-black/50 ring-1 ring-white/15 touch-none select-none overflow-hidden cursor-grab active:cursor-grabbing"
            style={{ backdropFilter: "blur(4px)" }}
          >
            {/* Fill from top */}
            <div
              className="absolute left-0 right-0 top-0 transition-[height] duration-75"
              style={{
                height: `${power * 100}%`,
                background: `linear-gradient(180deg, hsl(${120 - power * 120} 90% 45%), hsl(${120 - power * 120} 90% 35%))`,
              }}
            />
            {/* Knob */}
            <div
              className="absolute left-1 right-1 h-2 rounded-full bg-white shadow-lg pointer-events-none"
              style={{ top: `calc(${power * 100}% - 4px)` }}
            />
            {/* Label */}
            <div className="absolute inset-x-0 bottom-1 text-center text-[10px] font-black text-white/90 pointer-events-none">
              {Math.round(power * 100)}%
            </div>
            <div className="absolute inset-x-0 top-1 text-center text-[9px] font-bold text-white/70 pointer-events-none uppercase tracking-wider">
              Pull
            </div>
          </div>
          {!aim && (
            <div className="absolute left-2 top-2 glass rounded-xl px-3 py-1.5 text-[11px] font-bold pointer-events-none">
              Tap & drag on table to aim
            </div>
          )}
          {aim && (
            <div className="absolute left-2 top-2 glass rounded-xl px-3 py-1.5 text-[11px] font-bold pointer-events-none">
              Pull power slider down → release to shoot
            </div>
          )}
        </>
      )}
    </div>
  );
}
