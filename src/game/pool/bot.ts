import { POCKETS, BALL } from "./constants";
import type { MatchState } from "./types";

export type Difficulty = "easy" | "medium" | "hard";

export interface BotShot {
  dirX: number;
  dirZ: number;
  power: number;
}

function groupOf(id: number): "solid" | "stripe" | null {
  if (id === 0 || id === 8) return null;
  return id < 8 ? "solid" : "stripe";
}

// Pick the best straight-line shot: own group ball aimed at a pocket.
// Uses ghost-ball aim point: target = ball - normalize(pocket - ball) * 2r.
export function planBotShot(state: MatchState, diff: Difficulty): BotShot {
  const cue = state.balls.find(b => b.id === 0)!;
  const me = state.players[state.turn];
  const myCleared = me.group ? state.balls.filter(b => groupOf(b.id) === me.group && b.pocketed).length === 7 : false;

  const candidates = state.balls.filter(b => {
    if (b.pocketed || b.id === 0) return false;
    if (myCleared) return b.id === 8;
    if (me.group) return groupOf(b.id) === me.group;
    return b.id !== 8; // open table — any non-8
  });

  let best: { dx: number; dz: number; score: number; dist: number } | null = null;

  for (const ball of candidates) {
    for (const p of POCKETS) {
      const bpx = p.x - ball.x;
      const bpz = p.z - ball.z;
      const bpLen = Math.hypot(bpx, bpz) || 1;
      const nx = bpx / bpLen;
      const nz = bpz / bpLen;
      // Ghost ball: aim cue at this point so cue contacts ball at correct angle
      const ghostX = ball.x - nx * BALL.radius * 2;
      const ghostZ = ball.z - nz * BALL.radius * 2;
      const cdx = ghostX - cue.x;
      const cdz = ghostZ - cue.z;
      const cLen = Math.hypot(cdx, cdz) || 1;
      const dx = cdx / cLen;
      const dz = cdz / cLen;
      // Cue→ball direction must roughly match ball→pocket direction (cut angle ≤ ~70°)
      const cuetoball = { x: ball.x - cue.x, z: ball.z - cue.z };
      const cbLen = Math.hypot(cuetoball.x, cuetoball.z) || 1;
      const align = (cuetoball.x / cbLen) * nx + (cuetoball.z / cbLen) * nz;
      if (align <= 0.2) continue; // back-cut not feasible
      const score = align * 2 - cLen * 0.02 - bpLen * 0.02;
      if (!best || score > best.score) {
        best = { dx, dz, score, dist: cLen + bpLen };
      }
    }
  }

  if (!best) {
    // Fallback: aim toward center
    const dx = -cue.x, dz = -cue.z;
    const len = Math.hypot(dx, dz) || 1;
    return { dirX: dx / len, dirZ: dz / len, power: 0.55 };
  }

  // Difficulty noise
  const noise = diff === "easy" ? 0.18 : diff === "medium" ? 0.07 : 0.025;
  const ang = (Math.random() - 0.5) * noise;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const dirX = best.dx * cos - best.dz * sin;
  const dirZ = best.dx * sin + best.dz * cos;
  const power = Math.max(0.45, Math.min(0.95, 0.4 + best.dist * 0.04));
  return { dirX, dirZ, power };
}
