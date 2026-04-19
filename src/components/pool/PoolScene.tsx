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

// Convert world (x in [-halfW, halfW], z in [-halfH, halfH]) → canvas px
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

export default function PoolScene({ balls, interactive, ballInHand, onShoot, onPlaceCue, ghostHint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [aim, setAim] = useState<{ dx: number; dz: number } | null>(null);
  const [power, setPower] = useState(0.6);
  const [draggingCue, setDraggingCue] = useState(false);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      // maintain 2:1 ratio
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

    // Cushion edge highlight
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

    // Head string (vertical line at HEAD_SPOT_X area)
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const headX = ((-TABLE.halfW * 0.5 + TABLE.halfW) / TABLE.width) * size.w;
    ctx.beginPath();
    ctx.moveTo(headX, railPx);
    ctx.lineTo(headX, size.h - railPx);
    ctx.stroke();
    ctx.setLineDash([]);

    // Aim line (from cue ball)
    const cue = balls.find(b => b.id === 0);
    if (cue && !cue.pocketed && interactive && (aim || ghostHint)) {
      const a = aim ?? ghostHint!;
      const { px, py } = worldToCanvas(cue.x, cue.z, size.w, size.h);
      const len = Math.hypot(a.dx, a.dz) || 1;
      const ux = a.dx / len, uz = a.dz / len;
      const lineLen = size.w * 0.7;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + ux * lineLen, py + uz * lineLen);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Balls
    for (const b of balls) {
      if (b.pocketed) continue;
      const { px, py } = worldToCanvas(b.x, b.z, size.w, size.h);
      const r = (BALL.radius / TABLE.width) * size.w;
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2, r, 0, Math.PI * 2);
      ctx.fill();
      // Body
      const color = BALL_COLORS[b.id] ?? "#fff";
      if (b.kind === "stripe") {
        // White ball with colored stripe
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
      // Highlight
      const hl = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, 0, px, py, r);
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(0.6, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      // Number circle
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
      // Outline
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [balls, size, aim, ghostHint, interactive]);

  // Pointer handling
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
    // Aim mode: drag from cue ball
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
    // Aim is preserved; shoot via button
  };

  const handleShoot = () => {
    if (!interactive || !aim) return;
    onShoot(aim.dx, aim.dz, power);
  };

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="block w-full rounded-2xl ring-1 ring-white/10 touch-none cursor-crosshair"
        style={{ background: "#053f1f" }}
      />
      {interactive && (
        <div className="mt-3 flex items-center gap-3 glass rounded-2xl p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Power</div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.01}
            value={power}
            onChange={e => setPower(parseFloat(e.target.value))}
            className="flex-1 accent-primary"
          />
          <div className="text-sm font-bold w-10 text-right">{Math.round(power * 100)}%</div>
          <button
            onClick={handleShoot}
            disabled={!aim}
            className="glass-btn h-10 px-5 bg-primary/40 font-black disabled:opacity-40"
          >
            SHOOT
          </button>
        </div>
      )}
    </div>
  );
}
