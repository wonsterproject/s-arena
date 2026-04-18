// Simple Carrom bot: pick the closest own-color (or any if unassigned) piece
// and aim straight at it, with power based on distance + difficulty noise.
import { BOARD, POCKETS } from "./constants";
import type { MatchState } from "./types";

export type Difficulty = "easy" | "medium" | "hard";

export interface BotShot {
  strikerX: number;       // -baselineHalfWidth..+
  strikerZ: number;       // ±BOARD.baselineY
  dirX: number;           // unit vector toward target
  dirZ: number;
  power: number;          // 0..1
}

export function planBotShot(
  state: MatchState,
  pieces: { id: string; x: number; z: number; pocketed: boolean; color: string }[],
  diff: Difficulty,
): BotShot {
  const me = state.players[state.turn];
  const myColor = me.color; // may be null
  const targets = pieces.filter(p => !p.pocketed && (myColor ? p.color === myColor || p.color === "queen" : true));
  const baselineZ = me.side === 0 ? BOARD.baselineY : -BOARD.baselineY;

  // Pick best target: closest piece-to-pocket alignment from baseline
  let best: { sx: number; sz: number; dx: number; dz: number; score: number } | null = null;
  for (const t of targets) {
    for (const [px, pz] of POCKETS) {
      // Aim line: from striker baseline through piece toward pocket.
      // Ideal striker x is found by projecting back from piece toward (-pocket direction).
      const toPocketX = px - t.x;
      const toPocketZ = pz - t.z;
      const lenP = Math.hypot(toPocketX, toPocketZ) || 1;
      const npx = toPocketX / lenP;
      const npz = toPocketZ / lenP;
      // Place striker on the opposite side of piece, on baseline
      const sx = clamp(t.x - npx * 1.0, -BOARD.baselineHalfWidth, BOARD.baselineHalfWidth);
      const sz = baselineZ;
      const dx = t.x - sx;
      const dz = t.z - sz;
      const len = Math.hypot(dx, dz) || 1;
      const ndx = dx / len;
      const ndz = dz / len;
      // Score = alignment with pocket direction × inverse distance penalty
      const align = ndx * npx + ndz * npz; // 1 = perfect
      const score = align - len * 0.05 + (t.color === "queen" ? 0.3 : 0);
      if (!best || score > best.score) {
        best = { sx, sz, dx: ndx, dz: ndz, score };
      }
    }
  }

  if (!best) {
    // fallback: shoot straight
    return { strikerX: 0, strikerZ: baselineZ, dirX: 0, dirZ: me.side === 0 ? -1 : 1, power: 0.6 };
  }

  // Difficulty noise
  const noise = diff === "easy" ? 0.35 : diff === "medium" ? 0.12 : 0.04;
  const angleNoise = (Math.random() - 0.5) * noise;
  const cos = Math.cos(angleNoise), sin = Math.sin(angleNoise);
  const dx = best.dx * cos - best.dz * sin;
  const dz = best.dx * sin + best.dz * cos;
  const power = clamp(0.55 + Math.random() * 0.3, 0.5, 0.95);

  return { strikerX: best.sx, strikerZ: best.sz, dirX: dx, dirZ: dz, power };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
