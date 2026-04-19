import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { TABLE, BALL, POCKETS, BALL_COLORS } from "@/game/pool/constants";
import type { Ball } from "@/game/pool/types";

interface Props {
  balls: Ball[];
  interactive: boolean;
  ballInHand: boolean;
  power: number;                          // 0..1 from external power meter
  onShoot: (dirX: number, dirZ: number, power: number) => void;
  onPlaceCue: (x: number, z: number) => void;
  onAimChange?: (hasAim: boolean) => void;
  ghostHint?: { dx: number; dz: number } | null;
}

export interface PoolSceneApi {
  /** Call externally (e.g. from Shoot button) — fires the current aim with given power. */
  shoot: () => void;
  hasAim: () => boolean;
}

function worldToCanvas(x: number, z: number, w: number, h: number) {
  const px = ((x + TABLE.halfW) / TABLE.width) * w;
  const py = ((z + TABLE.halfH) / TABLE.height) * h;
  return { px, py };
}

function canvasToWorld(px: number, py: number, w: number, h: number) {
  const x = (px / w) * TABLE.width - TABLE.halfW;
  const z = (py / h) * TABLE.height - TABLE.halfH;
  return { x, z };
}

function predictFirstHit(
  ox: number, oz: number, ux: number, uz: number,
  balls: Ball[],
): { t: number; ball: Ball; ghostX: number; ghostZ: number } | null {
  const r2 = BALL.radius * 2;
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

const PoolScene = forwardRef<PoolSceneApi, Props>(function PoolScene(
  { balls, interactive, ballInHand, power, onShoot, onPlaceCue, onAimChange, ghostHint },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [aim, setAim] = useState<{ dx: number; dz: number } | null>(null);
  const [draggingCue, setDraggingCue] = useState(false);
  const aimRef = useRef(aim);
  useEffect(() => { aimRef.current = aim; onAimChange?.(!!aim); }, [aim, onAimChange]);

  useImperativeHandle(ref, () => ({
    shoot: () => {
      const a = aimRef.current;
      if (a && interactive) onShoot(a.dx, a.dz, Math.max(0.1, power));
    },
    hasAim: () => !!aimRef.current,
  }), [interactive, onShoot, power]);

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
    ctx.clearRect(0, 0, size.w, size.h);

    const railPx = (TABLE.cushionInset / TABLE.width) * size.w;
    const cornerCap = railPx * 2.6;

    // ---------- Outer wood frame ----------
    const woodGrad = ctx.createLinearGradient(0, 0, 0, size.h);
    woodGrad.addColorStop(0, "#8a4a1c");
    woodGrad.addColorStop(0.5, "#6b3410");
    woodGrad.addColorStop(1, "#3d1c06");
    ctx.fillStyle = woodGrad;
    roundRect(ctx, 0, 0, size.w, size.h, railPx * 0.9);
    ctx.fill();

    // Subtle wood grain
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = i % 2 === 0 ? "#000" : "#fff";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, (i / 30) * size.h);
      ctx.lineTo(size.w, (i / 30) * size.h + (Math.sin(i) * 4));
      ctx.stroke();
    }
    ctx.restore();

    // ---------- Blue cushion (inner wood-bordered rail area) ----------
    const cushionInset = railPx * 0.55;
    const cushionGrad = ctx.createLinearGradient(0, cushionInset, 0, size.h - cushionInset);
    cushionGrad.addColorStop(0, "#2563eb");
    cushionGrad.addColorStop(1, "#1e40af");
    ctx.fillStyle = cushionGrad;
    roundRect(ctx, cushionInset, cushionInset, size.w - cushionInset * 2, size.h - cushionInset * 2, railPx * 0.7);
    ctx.fill();

    // ---------- Felt playing area ----------
    const feltX = railPx;
    const feltY = railPx;
    const feltW = size.w - railPx * 2;
    const feltH = size.h - railPx * 2;
    const feltGrad = ctx.createRadialGradient(size.w / 2, size.h / 2, size.w * 0.05, size.w / 2, size.h / 2, size.w * 0.6);
    feltGrad.addColorStop(0, "#2f78d8");
    feltGrad.addColorStop(0.7, "#1e5fb8");
    feltGrad.addColorStop(1, "#143f80");
    ctx.fillStyle = feltGrad;
    ctx.fillRect(feltX, feltY, feltW, feltH);

    // Felt fabric noise (very subtle)
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = i % 2 ? "#fff" : "#000";
      ctx.fillRect(
        feltX + Math.random() * feltW,
        feltY + Math.random() * feltH,
        1, 1,
      );
    }
    ctx.restore();

    // ---------- Rail dots (diamond markers) ----------
    ctx.fillStyle = "#f5d000";
    const dotR = railPx * 0.07;
    const longSegs = 8;
    for (let i = 1; i < longSegs; i++) {
      if (i === longSegs / 2) continue; // skip middle (side pocket)
      const x = feltX + (i / longSegs) * feltW;
      ctx.beginPath();
      ctx.arc(x, railPx * 0.5, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, size.h - railPx * 0.5, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    const shortSegs = 4;
    for (let i = 1; i < shortSegs; i++) {
      const y = feltY + (i / shortSegs) * feltH;
      ctx.beginPath();
      ctx.arc(railPx * 0.5, y, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(size.w - railPx * 0.5, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---------- Corner brass caps ----------
    const brassGrad = (cx: number, cy: number) => {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, cornerCap);
      g.addColorStop(0, "#ffe49a");
      g.addColorStop(0.5, "#c89a3f");
      g.addColorStop(1, "#5e3a0c");
      return g;
    };
    const corners: Array<[number, number]> = [
      [0, 0], [size.w, 0], [0, size.h], [size.w, size.h],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillStyle = brassGrad(cx, cy);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, cornerCap, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pockets
    for (const p of POCKETS) {
      const { px, py } = worldToCanvas(p.x, p.z, size.w, size.h);
      const pr = (p.r / TABLE.width) * size.w;
      // Pocket shadow ring
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.arc(px, py, pr * 1.05, 0, Math.PI * 2);
      ctx.fill();
      // Pocket inner gradient
      const pg = ctx.createRadialGradient(px, py, 1, px, py, pr);
      pg.addColorStop(0, "#000");
      pg.addColorStop(0.7, "#1a1a1a");
      pg.addColorStop(1, "#000");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Head string (subtle)
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const headX = ((-TABLE.halfW * 0.5 + TABLE.halfW) / TABLE.width) * size.w;
    ctx.beginPath();
    ctx.moveTo(headX, feltY);
    ctx.lineTo(headX, feltY + feltH);
    ctx.stroke();
    ctx.setLineDash([]);

    const cue = balls.find(b => b.id === 0);
    const activeAim = aim ?? (ghostHint ? { dx: ghostHint.dx, dz: ghostHint.dz } : null);

    // Aim & prediction
    if (cue && !cue.pocketed && interactive && activeAim) {
      const len = Math.hypot(activeAim.dx, activeAim.dz) || 1;
      const ux = activeAim.dx / len, uz = activeAim.dz / len;
      const { px: cpx, py: cpy } = worldToCanvas(cue.x, cue.z, size.w, size.h);
      const ballRpx = (BALL.radius / TABLE.width) * size.w;

      const hit = predictFirstHit(cue.x, cue.z, ux, uz, balls);
      const endT = hit ? hit.t : TABLE.width * 2;
      const endWX = cue.x + ux * endT;
      const endWZ = cue.z + uz * endT;
      const { px: ex, py: ey } = worldToCanvas(endWX, endWZ, size.w, size.h);

      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(cpx + ux * ballRpx, cpy + uz * ballRpx);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hit) {
        const { px: gx, py: gy } = worldToCanvas(hit.ghostX, hit.ghostZ, size.w, size.h);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(gx, gy, ballRpx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const tx = hit.ball.x - hit.ghostX;
        const tz = hit.ball.z - hit.ghostZ;
        const tlen = Math.hypot(tx, tz) || 1;
        const tux = tx / tlen, tuz = tz / tlen;
        const { px: bpx, py: bpy } = worldToCanvas(hit.ball.x, hit.ball.z, size.w, size.h);
        const projLen = size.w * 0.3;
        const epx = bpx + tux * projLen;
        const epy = bpy + tuz * projLen;
        const col = BALL_COLORS[hit.ball.id] ?? "#fff";
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(bpx + tux * ballRpx, bpy + tuz * ballRpx);
        ctx.lineTo(epx, epy);
        ctx.stroke();
        ctx.setLineDash([]);
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
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2.5, r, 0, Math.PI * 2);
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
      hl.addColorStop(0, "rgba(255,255,255,0.65)");
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

    // CUE STICK
    if (cue && !cue.pocketed && interactive && activeAim) {
      const len = Math.hypot(activeAim.dx, activeAim.dz) || 1;
      const ux = activeAim.dx / len, uz = activeAim.dz / len;
      const { px: cpx, py: cpy } = worldToCanvas(cue.x, cue.z, size.w, size.h);
      const ballRpx = (BALL.radius / TABLE.width) * size.w;
      const stickLen = size.w * 0.42;
      const pullback = ballRpx * 0.6 + power * ballRpx * 5;
      const tipX = cpx - ux * (ballRpx + pullback);
      const tipY = cpy - uz * (ballRpx + pullback);
      const buttX = tipX - ux * stickLen;
      const buttY = tipY - uz * stickLen;
      const perpX = -uz, perpY = ux;
      const tipW = ballRpx * 0.22;
      const buttW = ballRpx * 0.55;
      const grad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
      grad.addColorStop(0, "#f0f0f0");
      grad.addColorStop(0.04, "#1a1a1a");
      grad.addColorStop(0.08, "#e8d5a8");
      grad.addColorStop(0.6, "#b8895a");
      grad.addColorStop(1, "#3a1f0a");
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
    setAim({ dx: w.x - cue.x, dz: w.z - cue.z });
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

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="block w-full rounded-2xl touch-none cursor-crosshair"
      />
    </div>
  );
});

export default PoolScene;

// ---------- helpers ----------
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
