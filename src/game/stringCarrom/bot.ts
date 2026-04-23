// Sling Puck bot — picks one of own pucks on own half, slings it toward the gap
// at a target on the opponent half. Difficulty adds aim error + power randomness.
import type { MatchState, Puck } from "./types";
import { GAP, SLING } from "./constants";
import { ownPucksOnOwnHalf, slingAnchorY } from "./rules";

export type Difficulty = "easy" | "medium" | "hard";

export interface SlingShot {
  puckId: number;     // which puck to sling
  dirX: number;       // unit direction the puck flies
  dirY: number;
  power: number;      // 0..1
}

export function planSlingShot(state: MatchState, diff: Difficulty): SlingShot | null {
  const turn = state.turn;
  const own = ownPucksOnOwnHalf(state, turn);
  if (own.length === 0) return null;

  // Prefer the puck closest to the center line (easiest to push through).
  const sorted = [...own].sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
  const puck = sorted[0];

  // Target Y on opponent half.
  const targetY = turn === 0 ? 0.55 : -0.55;
  // Target X biased toward the gap center but slightly randomized.
  const errMap = { easy: 0.20, medium: 0.09, hard: 0.03 };
  const err = errMap[diff];
  const gapCx = (GAP.xMin + GAP.xMax) / 2;
  const targetX = gapCx + (Math.random() - 0.5) * 0.06;

  // Direction: from puck toward target.
  let dx = targetX - puck.x;
  let dy = targetY - puck.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  // Add aim error.
  const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * err * 2;
  dx = Math.cos(angle); dy = Math.sin(angle);

  // Power: enough to cross + difficulty noise.
  const dist = Math.abs(slingAnchorY(turn) - targetY);
  let power = 0.6 + (dist - 1.0) * 0.1; // baseline
  if (diff === "easy") power = Math.min(1, 0.55 + Math.random() * 0.2);
  else if (diff === "medium") power = Math.min(1, 0.72 + Math.random() * 0.18);
  else power = Math.min(1, 0.85 + Math.random() * 0.15);

  return { puckId: puck.id, dirX: dx, dirY: dy, power: Math.max(0.4, Math.min(1, power)) };
}

// Legacy alias used by older code paths.
export function planBotShot(state: MatchState, diff: Difficulty) {
  const shot = planSlingShot(state, diff);
  if (!shot) return { strikerX: 0, strikerY: 0, dirX: 0, dirY: turn1Sign(state.turn), power: 0.5, puckId: -1 };
  return { strikerX: 0, strikerY: 0, dirX: shot.dirX, dirY: shot.dirY, power: shot.power, puckId: shot.puckId };
}
function turn1Sign(t: 0 | 1) { return t === 0 ? 1 : -1; }
