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
  /** Pixel width to render at — if omitted, fills container responsively. */
  fixedWidth?: number;
  fixedHeight?: number;
}

export interface PoolSceneApi {
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
  { balls, interactive, ballInHand, power, onShoot, onPlaceCue, onAimChange, ghostHint, fixedWidth, fixedHeight },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: fixedWidth ?? 800, h: fixedHeight ?? 400 });
  const [aim, setAim] = useState<{ dx: number; dz: number } | null>(null);
  const [draggingCue, setDraggingCue] = useState(false);
  const aimRef = useRef(aim);
  // Per-ball accumulated rotation angle (radians) for visual spin marker.
  const spinRef = useRef<Record<number, number>>({});
  // Last known position of each ball, to compute distance traveled per frame.
  const lastPosRef = useRef<Record<number, { x: number; z: number }>>({});

  useEffect(() => { aimRef.current = aim; onAimChange?.(!!aim); }, [aim, onAimChange]);

  useImperativeHandle(ref, () => ({
    shoot: () => {
      const a = aimRef.current;
      if (a && interactive) onShoot(a.dx, a.dz, Math.max(0.1, power));
    },
    hasAim: () => !!aimRef.current,
  }), [interactive, onShoot, power]);

  useEffect(() => {
    if (fixedWidth && fixedHeight) {
      setSize({ w: fixedWidth, h: fixedHeight });
      return;
    }
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
  }, [fixedWidth, fixedHeight]);

  // Update per-ball spin from movement distance.
  useEffect(() => {
    for (const b of balls) {
      const last = lastPosRef.current[b.id];
      if (last && !b.pocketed) {
        const dx = b.x - last.x, dz = b.z - last.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.001) {
          const dir = Math.atan2(dz, dx);
          // rolling: angle += distance / radius
          const prev = spinRef.current[b.id] ?? 0;
          spinRef.current[b.id] = prev + dist / BALL.radius;
          // Store direction to orient the spin marker
          (spinRef.current as any)[b.id + "_dir"] = dir;
        }
      }
      lastPosRef.current[b.id] = { x: b.x, z: b.z };
    }
  }, [balls]);

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

    // Outer wood frame
    const woodGrad = ctx.createLinearGradient(0, 0, 0, size.h);
    woodGrad.addColorStop(0, "#8a4a1c");
    woodGrad.addColorStop(0.5, "#6b3410");
    woodGrad.addColorStop(1, "#3d1c06");
    ctx.fillStyle = woodGrad;
    roundRect(ctx, 0, 0, size.w, size.h, railPx * 0.9);
    ctx.fill();

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

    // Blue cushion
    const cushionInset = railPx * 0.55;
    const cushionGrad = ctx.createLinearGradient(0, cushionInset, 0, size.h - cushionInset);
    cushionGrad.addColorStop(0, "#2563eb");
    cushionGrad.addColorStop(1, "#1e40af");
    ctx.fillStyle = cushionGrad;
    roundRect(ctx, cushionInset, cushionInset, size.w - cushionInset * 2, size.h - cushionInset * 2, railPx * 0.7);
    ctx.fill();

    // Felt
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

    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = i % 2 ? "#fff" : "#000";
      ctx.fillRect(feltX + Math.random() * feltW, feltY + Math.random() * feltH, 1, 1);
    }
    ctx.restore();

    // Rail dots
    ctx.fillStyle = "#f5d000";
    const dotR = railPx * 0.07;
    const longSegs = 8;
    for (let i = 1; i < longSegs; i++) {
      if (i === longSegs / 2) continue;
      const x = feltX + (i / longSegs) * feltW;
      ctx.beginPath(); ctx.arc(x, railPx * 0.5, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, size.h - railPx * 0.5, dotR, 0, Math.PI * 2); ctx.fill();
    }
    const shortSegs = 4;
    for (let i = 1; i < shortSegs; i++) {
      const y = feltY + (i / shortSegs) * feltH;
      ctx.beginPath(); ctx.arc(railPx * 0.5, y, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(size.w - railPx * 0.5, y, dotR, 0, Math.PI * 2); ctx.fill();
    }

    // Brass corners
    const brassGrad = (cx: number, cy: number) => {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, cornerCap);
      g.addColorStop(0, "#ffe49a"); g.addColorStop(0.5, "#c89a3f"); g.addColorStop(1, "#5e3a0c");
      return g;
    };
    for (const [cx, cy] of [[0,0],[size.w,0],[0,size.h],[size.w,size.h]] as [number,number][]) {
      ctx.fillStyle = brassGrad(cx, cy);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, cornerCap, 0, Math.PI * 2); ctx.fill();
    }

    // Pockets
    for (const p of POCKETS) {
      const { px, py } = worldToCanvas(p.x, p.z, size.w, size.h);
      const pr = (p.r / TABLE.width) * size.w;
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath(); ctx.arc(px, py, pr * 1.05, 0, Math.PI * 2); ctx.fill();
      const pg = ctx.createRadialGradient(px, py, 1, px, py, pr);
      pg.addColorStop(0, "#000"); pg.addColorStop(0.7, "#1a1a1a"); pg.addColorStop(1, "#000");
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }

    // Head string
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const headX = ((-TABLE.halfW * 0.5 + TABLE.halfW) / TABLE.width) * size.w;
    ctx.beginPath(); ctx.moveTo(headX, feltY); ctx.lineTo(headX, feltY + feltH); ctx.stroke();
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
        ctx.beginPath(); ctx.arc(gx, gy, ballRpx, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        const tx = hit.ball.x - hit.ghostX;
        const tz = hit.ball.z - hit.ghostZ;
        const tlen = Math.hypot(tx, tz) || 1;
        const tux = tx / tlen, tuz = tz / tlen;
        const { px: bpx, py: bpy } = worldToCanvas(hit.ball.x, hit.ball.z, size.w, size.h);
        const projLen = size.w * 0.25;
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

    // Balls — rendered as rotating spheres. Markers (number circles / stripe
    // band) are placed on the surface and projected so that as the ball rolls
    // they orbit around its body for a real rotation feel.
    for (const b of balls) {
      if (b.pocketed) continue;
      const { px, py } = worldToCanvas(b.x, b.z, size.w, size.h);
      const r = (BALL.radius / TABLE.width) * size.w;

      // Drop shadow
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.arc(px + 1.5, py + 2.5, r, 0, Math.PI * 2); ctx.fill();

      const color = BALL_COLORS[b.id] ?? "#fff";
      const angle = spinRef.current[b.id] ?? 0;
      const dir = (spinRef.current as any)[b.id + "_dir"] ?? 0;
      // roll: how far around the ball we've rotated (radians)
      const roll = angle;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(dir);  // align local x-axis with travel direction

      // ===== Base sphere body =====
      if (b.kind === "stripe") {
        // White poles (top + bottom caps), colored equator band that orbits.
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

        // Colored band: a horizontal stripe whose vertical position is fixed
        // in screen-perpendicular axis (across travel), but whose visible
        // height is modulated by roll → looks like the band rotates around.
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = color;
        // Base band height + breathing as ball rolls
        const halfBand = r * 0.55;
        ctx.fillRect(-r, -halfBand, r * 2, halfBand * 2);
        // Top + bottom white caps shrink/grow with roll to simulate stripe
        // rotating off the visible face.
        const capShift = Math.cos(roll) * r * 0.35;
        ctx.fillStyle = "#fff";
        ctx.fillRect(-r, -halfBand + capShift - r * 0.3, r * 2, r * 0.3);
        ctx.fillRect(-r,  halfBand + capShift, r * 2, r * 0.3);
        ctx.restore();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }

      // ===== Number markers (front + back of travel axis) =====
      // Two antipodal markers at angles `roll` and `roll + π`, placed on the
      // equator (so x = cos(θ) on the local axis, projected).
      // We render the marker that is currently in the front hemisphere (cosθ >= 0)
      // larger and fully opaque; the back one is hidden.
      if (b.id !== 0) {
        const drawMarker = (theta: number) => {
          const cosT = Math.cos(theta);
          if (cosT < 0.05) return; // back of sphere — hidden by body
          // x position along travel axis on sphere surface, projected to screen
          const localX = Math.sin(theta) * r * 0.78;
          // Marker shrinks as it approaches the silhouette (foreshortening)
          const scale = 0.42 * (0.4 + 0.6 * cosT);
          const mr = r * scale;
          // White disc
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(localX, 0, mr, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.25)";
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(localX, 0, mr, 0, Math.PI * 2); ctx.stroke();
          // Number — counter-rotate so digits stay upright
          ctx.save();
          ctx.translate(localX, 0);
          ctx.rotate(-dir);
          ctx.fillStyle = "#000";
          ctx.font = `bold ${Math.max(7, mr * 1.25)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(b.id), 0, 0.5);
          ctx.restore();
        };
        // Two antipodal markers offset by π so as ball rolls one disappears
        // behind while the other emerges — real rolling feel.
        drawMarker(roll);
        drawMarker(roll + Math.PI);
      } else {
        // Cue ball — small red dot orbiting the surface
        const cosT = Math.cos(roll);
        if (cosT > -0.2) {
          const localX = Math.sin(roll) * r * 0.55;
          ctx.fillStyle = "#dc2626";
          ctx.beginPath();
          ctx.arc(localX, 0, r * 0.13 * (0.5 + 0.5 * Math.max(0, cosT)), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Highlight (3D sheen)
      const hl = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 0, 0, 0, r);
      hl.addColorStop(0, "rgba(255,255,255,0.55)");
      hl.addColorStop(0.55, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

      // Soft rim shadow for depth
      const rim = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r);
      rim.addColorStop(0, "rgba(0,0,0,0)");
      rim.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = rim;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // ===== ADVANCED CUE STICK =====
    if (cue && !cue.pocketed && interactive && activeAim) {
      const len = Math.hypot(activeAim.dx, activeAim.dz) || 1;
      const ux = activeAim.dx / len, uz = activeAim.dz / len;
      const { px: cpx, py: cpy } = worldToCanvas(cue.x, cue.z, size.w, size.h);
      const ballRpx = (BALL.radius / TABLE.width) * size.w;
      const stickLen = size.w * 0.45;
      const pullback = ballRpx * 0.6 + power * ballRpx * 5;
      const tipX = cpx - ux * (ballRpx + pullback);
      const tipY = cpy - uz * (ballRpx + pullback);
      const buttX = tipX - ux * stickLen;
      const buttY = tipY - uz * stickLen;
      const perpX = -uz, perpY = ux;
      const tipW = ballRpx * 0.18;
      const buttW = ballRpx * 0.55;

      const drawTrap = (
        x1: number, y1: number, w1: number,
        x2: number, y2: number, w2: number,
        fill: string | CanvasGradient,
      ) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(x1 + perpX * w1, y1 + perpY * w1);
        ctx.lineTo(x2 + perpX * w2, y2 + perpY * w2);
        ctx.lineTo(x2 - perpX * w2, y2 - perpY * w2);
        ctx.lineTo(x1 - perpX * w1, y1 - perpY * w1);
        ctx.closePath();
        ctx.fill();
      };

      // Segment positions along cue from tip to butt
      // Section 1: ferrule (white) — very short
      const ferruleEndT = 0.04;
      const fxX = tipX - ux * stickLen * ferruleEndT;
      const fxY = tipY - uz * stickLen * ferruleEndT;
      const fW = tipW + (buttW - tipW) * ferruleEndT;
      drawTrap(tipX, tipY, tipW, fxX, fxY, fW, "#f5f0e0");

      // Section 2: black collar
      const collarEndT = 0.08;
      const cxX = tipX - ux * stickLen * collarEndT;
      const cyY = tipY - uz * stickLen * collarEndT;
      const cW = tipW + (buttW - tipW) * collarEndT;
      drawTrap(fxX, fxY, fW, cxX, cyY, cW, "#1a1a1a");

      // Section 3: shaft (pale maple)
      const shaftEndT = 0.55;
      const sxX = tipX - ux * stickLen * shaftEndT;
      const syY = tipY - uz * stickLen * shaftEndT;
      const sW = tipW + (buttW - tipW) * shaftEndT;
      const shaftGrad = ctx.createLinearGradient(
        cxX + perpX * cW, cyY + perpY * cW,
        cxX - perpX * cW, cyY - perpY * cW,
      );
      shaftGrad.addColorStop(0, "#f4e4bf");
      shaftGrad.addColorStop(0.5, "#e8d29a");
      shaftGrad.addColorStop(1, "#a07a4a");
      drawTrap(cxX, cyY, cW, sxX, syY, sW, shaftGrad);

      // Section 4: joint (silver ring) — short
      const jointEndT = 0.6;
      const jxX = tipX - ux * stickLen * jointEndT;
      const jyY = tipY - uz * stickLen * jointEndT;
      const jW = tipW + (buttW - tipW) * jointEndT;
      drawTrap(sxX, syY, sW, jxX, jyY, jW, "#c0c0c0");

      // Section 5: butt (dark wood with subtle gradient)
      const buttGrad = ctx.createLinearGradient(
        jxX + perpX * jW, jyY + perpY * jW,
        jxX - perpX * jW, jyY - perpY * jW,
      );
      buttGrad.addColorStop(0, "#5a2a0a");
      buttGrad.addColorStop(0.5, "#3a1808");
      buttGrad.addColorStop(1, "#1a0a04");
      drawTrap(jxX, jyY, jW, buttX, buttY, buttW, buttGrad);

      // Decorative wraps on butt (3 thin gold rings)
      for (let i = 1; i <= 3; i++) {
        const t = jointEndT + (1 - jointEndT) * (i / 4);
        const rxX = tipX - ux * stickLen * t;
        const ryY = tipY - uz * stickLen * t;
        const rxX2 = tipX - ux * stickLen * (t + 0.012);
        const ryY2 = tipY - uz * stickLen * (t + 0.012);
        const rW = tipW + (buttW - tipW) * t;
        drawTrap(rxX, ryY, rW * 1.02, rxX2, ryY2, rW * 1.02, "#d4af37");
      }

      // Bumper at butt end
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.arc(buttX, buttY, buttW * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // Cue tip (blue chalk)
      ctx.fillStyle = "#1e40af";
      ctx.beginPath();
      ctx.arc(tipX, tipY, tipW * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // Cue stick subtle outline
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tipX + perpX * tipW, tipY + perpY * tipW);
      ctx.lineTo(buttX + perpX * buttW, buttY + perpY * buttW);
      ctx.lineTo(buttX - perpX * buttW, buttY - perpY * buttW);
      ctx.lineTo(tipX - perpX * tipW, tipY - perpY * tipW);
      ctx.closePath();
      ctx.stroke();
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
      // Decide: tapping near cue ball = pick it up to drag; otherwise = aim.
      const dist = Math.hypot(w.x - cue.x, w.z - cue.z);
      // Generous grab radius — 3x ball radius — so it's easy to grab on mobile.
      if (dist < BALL.radius * 3) {
        setDraggingCue(true);
        onPlaceCue(w.x, w.z);
        return;
      }
      // Otherwise treat as aim — cue ball already placed, user wants to shoot.
      setAim({ dx: w.x - cue.x, dz: w.z - cue.z });
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
    <div ref={containerRef} className="relative" style={fixedWidth ? { width: fixedWidth, height: fixedHeight } : { width: "100%" }}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="block rounded-2xl touch-none cursor-crosshair"
        style={fixedWidth ? { width: fixedWidth, height: fixedHeight } : { width: "100%" }}
      />
    </div>
  );
});

export default PoolScene;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
