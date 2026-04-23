// Sling Puck bot — TURN-LESS mode.
// Bot continuously picks one of its OWN pucks remaining on its own half
// and slings it through the gap toward the opponent's side.
import type { MatchState, Puck } from "./types";
import { GAP, SLING, PHYS } from "./constants";

export type Difficulty = "easy" | "medium" | "hard";

export interface SlingShot {
  puckId: number;
  dirX: number;
  dirY: number;
  power: number;
}

// Pick one of `botSide`'s own pucks still on its own half and sling it through the gap.
export function planSlingShot(state: MatchState, diff: Difficulty, botSide: 0 | 1 = 1): SlingShot | null {
  // Bot's own pucks on bot's own half.
  const onMyHalf = (p: Puck) => botSide === 0
    ? p.y < -0.02
    : p.y > 0.02;

  const own = state.pucks.filter(p => p.alive && p.side === botSide && onMyHalf(p));
  if (own.length === 0) return null;

  // Prefer puck closest to the center line (easiest to push through).
  const sorted = [...own].sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
  const puck = sorted[0];

  // Target Y on opponent half.
  const targetY = botSide === 0 ? 0.45 : -0.45;
  const errMap = { easy: 0.22, medium: 0.10, hard: 0.04 };
  const err = errMap[diff];
  const gapCx = (GAP.xMin + GAP.xMax) / 2;
  const targetX = gapCx + (Math.random() - 0.5) * 0.05;

  let dx = targetX - puck.x;
  let dy = targetY - puck.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * err * 2;
  dx = Math.cos(angle); dy = Math.sin(angle);

  let power: number;
  if (diff === "easy") power = 0.55 + Math.random() * 0.20;
  else if (diff === "medium") power = 0.72 + Math.random() * 0.18;
  else power = 0.85 + Math.random() * 0.15;
  power = Math.max(0.4, Math.min(1, power));

  return { puckId: puck.id, dirX: dx, dirY: dy, power };
}

export function planBotShot(state: MatchState, diff: Difficulty, botSide: 0 | 1 = 1) {
  const shot = planSlingShot(state, diff, botSide);
  if (!shot) return null;
  return { strikerX: 0, strikerY: 0, dirX: shot.dirX, dirY: shot.dirY, power: shot.power, puckId: shot.puckId };
}
