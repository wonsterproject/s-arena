// Sling Puck Scene — vertical wooden board with center divider + gap.
// Interaction: drag any of YOUR pucks BACK toward your baseline (rubber band stretches),
// release to sling it forward.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BOARD, PUCK, GAP, SLING } from "@/game/stringCarrom/constants";
import type { Puck } from "@/game/stringCarrom/types";

interface Props {
  pucks: Puck[];
  turn: 0 | 1;
  /** Side the local human is on (so we know which pucks are "yours"). */
  mySide: 0 | 1;
  interactive: boolean;
  /** Called on release: which puck to shoot, release position (world), direction (unit), power 0..1. */
  onSling: (puckId: number, posX: number, posY: number, dirX: number, dirY: number, power: number) => void;
  /**
   * Optional "ghost" telegraph for opponent (bot OR online opponent).
   * Shows their puck being pulled back, aim arrow, and power bar in a translucent style
   * so the local player can SEE what the opponent is about to do (just like watching
   * their own move). Set to null when opponent is idle.
   */
  ghost?: {
    puckId: number;
    /** Current dragged-back position in world coords. */
    posX: number;
    posY: number;
    /** Sling anchor side (0 = bottom, 1 = top). Determines which band stretches. */
    side: 0 | 1;
    /** Anchor X/Y of the sling attach point. */
    anchorX: number;
    anchorY: number;
    /** Aim direction (unit) — where the puck will fly after release. */
    dirX: number;
    dirY: number;
    /** Pull power 0..1. */
    power: number;
  } | null;
}

export interface SCSceneApi { reset: () => void; }

// World x ∈ [-0.5, 0.5] (width), y ∈ [-0.5, 0.5] (height) — SQUARE board.
// Canvas: square, width:height = 1:1.
function w2c(x: number, y: number, w: number, h: number) {
  const sx = w / 1; // world width 1
  const sy = h / 1; // world height 1
  return { px: (x + 0.5) * sx, py: (-y + 0.5) * sy };
}
function c2w(px: number, py: number, w: number, h: number) {
  const sx = w / 1;
  const sy = h / 1;
  return { x: px / sx - 0.5, y: -(py / sy - 0.5) };
}

const WOOD_LIGHT = "#d8a86a";
const WOOD_DARK = "#a06d33";
const WOOD_FRAME = "#5a3a18";
const DIVIDER_DARK = "#3a2410";
const PUCK_WHITE = "#f5efe2";
const PUCK_WHITE_RIM = "#9c917a";
const PUCK_BLACK = "#1a1f2b";
const PUCK_BLACK_RIM = "#0a0c12";
const SLING_BAND = "#1a1a1a";
const ARROW_HOT = "hsla(45, 95%, 60%, 0.95)";
const ARROW_COOL = "hsla(140, 80%, 55%, 0.85)";

const SlingPuckScene = forwardRef<SCSceneApi, Props>(
  ({ pucks, turn, mySide, interactive, onSling, ghost }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [size, setSize] = useState({ w: 400, h: 800 });
    // Drag has TWO phases:
    //  - phase "moving": player is dragging puck toward the sling band; no aim arrow yet.
    //  - phase "attached": puck has touched the sling band; now it stretches and shows aim+power.
    const dragRef = useRef<null | {
      puckId: number;
      phase: "moving" | "attached";
      // Pointer offset from puck center at grab time (so puck follows finger naturally).
      offX: number; offY: number;
      // Current puck position while dragging (world coords).
      curPx: number; curPy: number;
      // Anchor point captured when puck attaches to the sling band.
      anchorX: number; anchorY: number;
    }>(null);
    const [, force] = useState(0);
    const ghostRef = useRef(ghost);
    ghostRef.current = ghost;

    useImperativeHandle(ref, () => ({
      reset: () => { dragRef.current = null; force(n => n + 1); }
    }), []);

    // Resize: square 1:1.
    useEffect(() => {
      const el = canvasRef.current?.parentElement;
      if (!el) return;
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const cw = e.contentRect.width;
          const maxH = window.innerHeight * 0.7;
          const side = Math.min(cw, maxH);
          setSize({ w: side, h: side });
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Draw loop
    useEffect(() => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      let raf = 0;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.floor(size.w * dpr);
      cvs.height = Math.floor(size.h * dpr);
      cvs.style.width = `${size.w}px`;
      cvs.style.height = `${size.h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const draw = () => {
        const w = size.w, h = size.h;
        // Background (dark mat)
        ctx.fillStyle = "#0a0d14";
        ctx.fillRect(0, 0, w, h);

        // Wooden board background with vertical grain gradient
        const woodGrad = ctx.createLinearGradient(0, 0, 0, h);
        woodGrad.addColorStop(0, WOOD_LIGHT);
        woodGrad.addColorStop(0.5, "#c08850");
        woodGrad.addColorStop(1, WOOD_DARK);
        ctx.fillStyle = woodGrad;
        ctx.fillRect(0, 0, w, h);

        // Wood grain — subtle horizontal striations
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = "#3a2410";
        for (let i = 0; i < h; i += 3) {
          ctx.beginPath();
          ctx.moveTo(0, i + Math.sin(i * 0.05) * 2);
          ctx.lineTo(w, i + Math.cos(i * 0.04) * 2);
          ctx.stroke();
        }
        ctx.restore();

        // Outer frame
        ctx.lineWidth = Math.max(8, w * 0.04);
        ctx.strokeStyle = WOOD_FRAME;
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);

        // Center divider wall
        const wallY = w2c(0, 0, w, h).py;
        const wallThk = Math.max(8, h * 0.018);
        // Left segment
        const gapMinPx = w2c(GAP.xMin, 0, w, h).px;
        const gapMaxPx = w2c(GAP.xMax, 0, w, h).px;
        ctx.fillStyle = DIVIDER_DARK;
        ctx.fillRect(0, wallY - wallThk / 2, gapMinPx, wallThk);
        ctx.fillRect(gapMaxPx, wallY - wallThk / 2, w - gapMaxPx, wallThk);
        // Highlight edges
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(0, wallY - wallThk / 2, gapMinPx, 1.5);
        ctx.fillRect(gapMaxPx, wallY - wallThk / 2, w - gapMaxPx, 1.5);

        // Decorative gap arrows + center markings (simple lines pointing toward both halves)
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1.2;
        const gapCx = (gapMinPx + gapMaxPx) / 2;
        ctx.beginPath();
        ctx.arc(gapCx, wallY, (gapMaxPx - gapMinPx) / 2 - 4, 0, Math.PI * 2);
        ctx.stroke();

        // Sling rubber bands at each player's baseline.
        // Band only stretches once the puck is ATTACHED (touched the band).
        const drawSling = (side: 0 | 1) => {
          const anchorY = side === 0 ? SLING.anchorYA : SLING.anchorYB;
          const a1 = w2c(-BOARD.halfW + 0.04, anchorY, w, h);
          const a2 = w2c(BOARD.halfW - 0.04, anchorY, w, h);
          const drag = dragRef.current;
          const g = ghostRef.current;
          // Match the band by the player's side (mySide), NOT the puck's original color side.
          // A black puck dragged on the bottom half must stretch the bottom band.
          const attachedThisSide = drag && drag.phase === "attached" && mySide === side;
          const ghostThisSide = g && g.side === side;
          // Where the band tip should be pulled to (drag wins, else ghost).
          let tipX: number | null = null, tipY: number | null = null;
          if (attachedThisSide && drag) { tipX = drag.curPx; tipY = drag.curPy; }
          else if (ghostThisSide && g) { tipX = g.posX; tipY = g.posY; }
          // Posts
          ctx.save();
          ctx.globalAlpha = (attachedThisSide || ghostThisSide) ? 0.25 : 1;
          ctx.fillStyle = "#2a1a08";
          ctx.beginPath();
          ctx.arc(a1.px, a1.py, 5, 0, Math.PI * 2);
          ctx.arc(a2.px, a2.py, 5, 0, Math.PI * 2);
          ctx.fill();
          // Band: V-shape only when attached & stretched; otherwise a straight line.
          ctx.strokeStyle = ghostThisSide && !attachedThisSide ? "hsla(0, 80%, 65%, 0.85)" : SLING_BAND;
          ctx.lineWidth = 3;
          ctx.beginPath();
          if (tipX !== null && tipY !== null) {
            const ppos = w2c(tipX, tipY, w, h);
            ctx.moveTo(a1.px, a1.py);
            ctx.lineTo(ppos.px, ppos.py);
            ctx.lineTo(a2.px, a2.py);
          } else {
            ctx.moveTo(a1.px, a1.py);
            ctx.lineTo(a2.px, a2.py);
          }
          ctx.stroke();
          ctx.restore();
        };
        drawSling(0);
        drawSling(1);

        // Pucks — render at finger position while local dragging, OR at ghost position
        // if opponent is currently telegraphing a shot on this puck.
        const drag = dragRef.current;
        const g = ghostRef.current;
        for (const p of pucks) {
          if (!p.alive) continue;
          let drawX = p.x, drawY = p.y;
          let isGhost = false;
          if (drag && drag.puckId === p.id) {
            drawX = drag.curPx;
            drawY = drag.curPy;
          } else if (g && g.puckId === p.id) {
            drawX = g.posX;
            drawY = g.posY;
            isGhost = true;
          }
          const c = w2c(drawX, drawY, w, h);
          const r = PUCK.radius * (w / 1);
          ctx.save();
          if (isGhost) ctx.globalAlpha = 0.55;
          // Shadow
          ctx.beginPath();
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.arc(c.px + 2, c.py + 4, r, 0, Math.PI * 2);
          ctx.fill();
          // Body
          const grad = ctx.createRadialGradient(
            c.px - r * 0.35, c.py - r * 0.4, r * 0.15,
            c.px, c.py, r,
          );
          if (p.side === 0) {
            grad.addColorStop(0, "#ffffff");
            grad.addColorStop(0.7, PUCK_WHITE);
            grad.addColorStop(1, "#c8bfa6");
            ctx.fillStyle = grad;
          } else {
            grad.addColorStop(0, "#4a5468");
            grad.addColorStop(0.7, PUCK_BLACK);
            grad.addColorStop(1, "#080a10");
            ctx.fillStyle = grad;
          }
          ctx.beginPath();
          ctx.arc(c.px, c.py, r, 0, Math.PI * 2);
          ctx.fill();
          // Inner ring
          ctx.strokeStyle = p.side === 0 ? PUCK_WHITE_RIM : PUCK_BLACK_RIM;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(c.px, c.py, r * 0.55, 0, Math.PI * 2);
          ctx.strokeStyle = p.side === 0 ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1;
          ctx.stroke();
          // Glow when interactive + this puck is on MY side (any color is grabbable)
          const puckOnMySide = mySide === 0 ? p.y < 0 : p.y > 0;
          if (interactive && puckOnMySide && !drag) {
            ctx.strokeStyle = "rgba(255, 215, 100, 0.7)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(c.px, c.py, r + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Red telegraph ring around opponent's ghost puck.
          if (isGhost) {
            ctx.strokeStyle = "hsla(0, 90%, 60%, 0.9)";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(c.px, c.py, r + 5, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Aim arrow & power readout — ONLY after puck has attached to the sling band.
        if (drag && drag.phase === "attached") {
          const puck = pucks.find(q => q.id === drag.puckId);
          if (puck) {
            ctx.save();
            ctx.globalAlpha = 0.2;
            const dragDX = drag.curPx - drag.anchorX;
            const dragDY = drag.curPy - drag.anchorY;
            const pullLen = Math.hypot(dragDX, dragDY);
            const maxPull = SLING.maxPull;
            const power = Math.max(0, Math.min(1, pullLen / maxPull));
            // Sling fires OPPOSITE of pull direction.
            const dirX = pullLen > 0.001 ? -dragDX / pullLen : 0;
            const dirY = pullLen > 0.001 ? -dragDY / pullLen : 0;
            const ppos = w2c(drag.curPx, drag.curPy, w, h);
            // Direction arrow from puck pos forward
            const arrLenWorld = 0.18 + power * 0.5;
            const tip = w2c(drag.curPx + dirX * arrLenWorld, drag.curPy + dirY * arrLenWorld, w, h);
            ctx.strokeStyle = power > 0.7 ? ARROW_HOT : ARROW_COOL;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(ppos.px, ppos.py);
            ctx.lineTo(tip.px, tip.py);
            ctx.stroke();
            // Arrow head
            const ang = Math.atan2(tip.py - ppos.py, tip.px - ppos.px);
            ctx.beginPath();
            ctx.moveTo(tip.px, tip.py);
            ctx.lineTo(tip.px - Math.cos(ang - 0.5) * 14, tip.py - Math.sin(ang - 0.5) * 14);
            ctx.lineTo(tip.px - Math.cos(ang + 0.5) * 14, tip.py - Math.sin(ang + 0.5) * 14);
            ctx.closePath();
            ctx.fillStyle = power > 0.7 ? ARROW_HOT : ARROW_COOL;
            ctx.fill();

            // Power bar
            const bx = w / 2 - 80;
            const by = (mySide === 0) ? h - 30 : 18;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(bx - 4, by - 4, 168, 16);
            const pgrad = ctx.createLinearGradient(bx, 0, bx + 160, 0);
            pgrad.addColorStop(0, "#22c55e");
            pgrad.addColorStop(0.5, "#fbbf24");
            pgrad.addColorStop(1, "#ef4444");
            ctx.fillStyle = pgrad;
            ctx.fillRect(bx, by, 160 * power, 8);
            ctx.strokeStyle = "rgba(255,255,255,0.6)";
            ctx.strokeRect(bx, by, 160, 8);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(`${Math.round(power * 100)}%`, w / 2, by - 6);
            ctx.restore();
          }
        }

        // GHOST aim arrow + power bar — opponent's telegraph (red palette).
        if (g) {
          ctx.save();
          ctx.globalAlpha = 0.8;
          const ppos = w2c(g.posX, g.posY, w, h);
          const arrLenWorld = 0.18 + g.power * 0.5;
          const tip = w2c(g.posX + g.dirX * arrLenWorld, g.posY + g.dirY * arrLenWorld, w, h);
          ctx.strokeStyle = "hsla(0, 90%, 60%, 0.9)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(ppos.px, ppos.py);
          ctx.lineTo(tip.px, tip.py);
          ctx.stroke();
          const ang = Math.atan2(tip.py - ppos.py, tip.px - ppos.px);
          ctx.beginPath();
          ctx.moveTo(tip.px, tip.py);
          ctx.lineTo(tip.px - Math.cos(ang - 0.5) * 14, tip.py - Math.sin(ang - 0.5) * 14);
          ctx.lineTo(tip.px - Math.cos(ang + 0.5) * 14, tip.py - Math.sin(ang + 0.5) * 14);
          ctx.closePath();
          ctx.fillStyle = "hsla(0, 90%, 60%, 0.9)";
          ctx.fill();
          const bx = w / 2 - 80;
          const by = (g.side === 0) ? h - 30 : 18;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(bx - 4, by - 4, 168, 16);
          const pgrad = ctx.createLinearGradient(bx, 0, bx + 160, 0);
          pgrad.addColorStop(0, "hsl(0, 90%, 50%)");
          pgrad.addColorStop(1, "hsl(20, 95%, 60%)");
          ctx.fillStyle = pgrad;
          ctx.fillRect(bx, by, 160 * g.power, 8);
          ctx.strokeStyle = "rgba(255, 200, 200, 0.7)";
          ctx.strokeRect(bx, by, 160, 8);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(`OPP ${Math.round(g.power * 100)}%`, w / 2, by - 6);
          ctx.restore();
        }

        raf = requestAnimationFrame(draw);
      };
      draw();
      return () => cancelAnimationFrame(raf);
    }, [size, pucks, turn, mySide, interactive]);

    // Pointer interaction — TWO PHASES:
    //  1) "moving":  puck follows finger anywhere on the player's own half.
    //                It does NOT attach to the sling until it touches the band line.
    //  2) "attached": once the puck reaches the sling band (anchor Y), the band grabs it.
    //                 From here the player drags BACK (toward baseline) to stretch & aim.
    //                 Releasing fires the puck in the OPPOSITE direction of the stretch.
    useEffect(() => {
      const cvs = canvasRef.current;
      if (!cvs) return;

      const local = (e: PointerEvent) => {
        const rect = cvs.getBoundingClientRect();
        return { px: e.clientX - rect.left, py: e.clientY - rect.top };
      };

      const onDown = (e: PointerEvent) => {
        if (!interactive) return;
        const { px, py } = local(e);
        const wp = c2w(px, py, size.w, size.h);
        // Find nearest puck on MY side (any color — own or opponent's) within grab radius.
        let best: Puck | null = null;
        let bestD = Infinity;
        const grabR = PUCK.radius * 1.8;
        for (const p of pucks) {
          if (!p.alive) continue;
          const onMySide = mySide === 0 ? p.y < 0 : p.y > 0;
          if (!onMySide) continue;
          const d = Math.hypot(wp.x - p.x, wp.y - p.y);
          if (d < grabR && d < bestD) { bestD = d; best = p; }
        }
        if (!best) return;
        cvs.setPointerCapture(e.pointerId);
        dragRef.current = {
          puckId: best.id,
          phase: "moving",
          offX: best.x - wp.x,
          offY: best.y - wp.y,
          curPx: best.x,
          curPy: best.y,
          anchorX: 0,
          anchorY: 0,
        };
        e.preventDefault();
      };

      const onMove = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const { px, py } = local(e);
        const wp = c2w(px, py, size.w, size.h);
        const r = PUCK.radius;
        const slingY = mySide === 0 ? SLING.anchorYA : SLING.anchorYB;

        // Clamp to own half + within board walls.
        const clampToOwnHalf = (cx: number, cy: number) => {
          let nx = cx, ny = cy;
          if (nx < -BOARD.halfW + r) nx = -BOARD.halfW + r;
          if (nx >  BOARD.halfW - r) nx =  BOARD.halfW - r;
          if (mySide === 0) {
            if (ny > -r) ny = -r;
            if (ny < -BOARD.halfH + r) ny = -BOARD.halfH + r;
          } else {
            if (ny < r) ny = r;
            if (ny >  BOARD.halfH - r) ny =  BOARD.halfH - r;
          }
          return { nx, ny };
        };

        if (drag.phase === "moving") {
          // Puck follows finger freely on own half.
          const targetX = wp.x + drag.offX;
          const targetY = wp.y + drag.offY;
          const { nx, ny } = clampToOwnHalf(targetX, targetY);
          drag.curPx = nx;
          drag.curPy = ny;
          // Detect contact with the sling band line.
          const reached = mySide === 0
            ? (drag.curPy <= slingY + r)   // bottom: moving DOWN toward y = -0.46
            : (drag.curPy >= slingY - r);  // top:    moving UP   toward y =  0.46
          if (reached) {
            // Snap puck so it just touches the band line, then attach.
            drag.curPy = mySide === 0 ? slingY + r : slingY - r;
            drag.phase = "attached";
            drag.anchorX = drag.curPx;
            drag.anchorY = drag.curPy;
          }
        } else {
          // Attached — pull BACK only (toward baseline).
          let cx = wp.x + drag.offX;
          let cy = wp.y + drag.offY;
          if (mySide === 0 && cy > drag.anchorY) cy = drag.anchorY;
          if (mySide === 1 && cy < drag.anchorY) cy = drag.anchorY;
          // Cap pull length from anchor.
          const dx = cx - drag.anchorX;
          const dy = cy - drag.anchorY;
          const len = Math.hypot(dx, dy);
          const maxPull = SLING.maxPull;
          if (len > maxPull) {
            cx = drag.anchorX + (dx / len) * maxPull;
            cy = drag.anchorY + (dy / len) * maxPull;
          }
          // Keep horizontally within board; vertically allow up to wall, but not past anchor toward center.
          if (cx < -BOARD.halfW + r) cx = -BOARD.halfW + r;
          if (cx >  BOARD.halfW - r) cx =  BOARD.halfW - r;
          if (mySide === 0) {
            if (cy < -BOARD.halfH + r) cy = -BOARD.halfH + r;
          } else {
            if (cy >  BOARD.halfH - r) cy =  BOARD.halfH - r;
          }
          drag.curPx = cx;
          drag.curPy = cy;
        }
      };

      const onUp = (e: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        try { cvs.releasePointerCapture(e.pointerId); } catch {}
        dragRef.current = null;
        // Only fire when attached AND pulled back enough.
        if (drag.phase !== "attached") return;
        const dx = drag.curPx - drag.anchorX;
        const dy = drag.curPy - drag.anchorY;
        const pullLen = Math.hypot(dx, dy);
        const maxPull = SLING.maxPull;
        const power = Math.max(0, Math.min(1, pullLen / maxPull));
        if (power < 0.08 || pullLen < 0.001) return;
        const dirX = -dx / pullLen;
        const dirY = -dy / pullLen;
        onSling(drag.puckId, drag.curPx, drag.curPy, dirX, dirY, power);
      };

      cvs.addEventListener("pointerdown", onDown);
      cvs.addEventListener("pointermove", onMove);
      cvs.addEventListener("pointerup", onUp);
      cvs.addEventListener("pointercancel", onUp);
      return () => {
        cvs.removeEventListener("pointerdown", onDown);
        cvs.removeEventListener("pointermove", onMove);
        cvs.removeEventListener("pointerup", onUp);
        cvs.removeEventListener("pointercancel", onUp);
      };
    }, [size, interactive, turn, mySide, pucks, onSling]);

    return (
      <div className="w-full flex justify-center">
        <canvas
          ref={canvasRef}
          className="block rounded-2xl touch-none"
          style={{ aspectRatio: "1 / 1", background: "#0a0d14" }}
        />
      </div>
    );
  }
);

SlingPuckScene.displayName = "SlingPuckScene";
export default SlingPuckScene;
