// Sling Puck bot — TURN-LESS mode.
// Bot continuously picks one of its OWN pucks remaining on its own half
// and slings it through the gap toward the opponent's side.
//
// Smart mode: forward-simulates several candidate shots and picks the one
// that pushes the puck farthest into the opponent's half (and through the gap).
import type { MatchState, Puck } from "./types";
import { GAP, SLING, PUCK, BOARD } from "./constants";
import { applySlingShot, step } from "./physics";

export type Difficulty = "easy" | "medium" | "hard";

export interface SlingShot {
  puckId: number;
  dirX: number;
  dirY: number;
  power: number;
}

// Public planner: chooses the best shot among many candidates, then adds difficulty noise.
export function planSlingShot(state: MatchState, diff: Difficulty, botSide: 0 | 1 = 1): SlingShot | null {
  const onMyHalf = (p: Puck) => botSide === 0 ? p.y < -0.02 : p.y > 0.02;
  // Pick from BOT'S OWN pucks still on its half. Prefer those closest to center line.
  let candidates = state.pucks.filter(p => p.alive && p.side === botSide && onMyHalf(p));

  // Fallback: if no own pucks remain on bot's half, also accept opponent-color pucks
  // that landed on bot's half — bot can throw them back to prevent opponent winning.
  if (candidates.length === 0) {
    candidates = state.pucks.filter(p => p.alive && onMyHalf(p));
  }
  if (candidates.length === 0) return null;

  // Sort by closeness to center (front-most first) and try top 3.
  candidates.sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
  const tryPucks = candidates.slice(0, 3);

  const best = pickBestShot(state, tryPucks, botSide);
  if (!best) return null;

  // Apply difficulty error AFTER picking the best aim.
  const errMap: Record<Difficulty, { angle: number; powerJitter: number }> = {
    easy:   { angle: 0.18,  powerJitter: 0.18 },  // wobbly aim
    medium: { angle: 0.06,  powerJitter: 0.08 },
    hard:   { angle: 0.015, powerJitter: 0.02 },  // ~90%+ accurate
  };
  const e = errMap[diff];
  const angle = Math.atan2(best.dirY, best.dirX) + (Math.random() - 0.5) * 2 * e.angle;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const power = clamp(best.power + (Math.random() - 0.5) * 2 * e.powerJitter, 0.5, 1);

  return { puckId: best.puckId, dirX, dirY, power };
}

// Internal: forward-simulate several aim/power combos for each candidate puck
// and score by "how far into the opponent's half does this puck end up".
function pickBestShot(
  state: MatchState,
  candidates: Puck[],
  botSide: 0 | 1,
): SlingShot | null {
  const goalSign = botSide === 0 ? 1 : -1; // direction that means "into opponent half"
  const gapCx = (GAP.xMin + GAP.xMax) / 2;
  let best: { score: number; shot: SlingShot } | null = null;

  // Aim points: gap center + a few jittered targets so we don't always slam the same spot.
  const aimXs = [gapCx, gapCx - 0.04, gapCx + 0.04, gapCx - 0.02, gapCx + 0.02];
  const targetY = botSide === 0 ? 0.45 : -0.45;
  // Power tiers — only "strong" shots that reliably cross the gap.
  const powers = [0.78, 0.88, 0.98];

  for (const puck of candidates) {
    for (const ax of aimXs) {
      let dx = ax - puck.x;
      let dy = targetY - puck.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      // Reject shots aimed sideways or backwards (must point INTO opponent half).
      if (Math.sign(dy) !== goalSign) continue;

      for (const power of powers) {
        const score = simulateScore(state.pucks, puck.id, dx, dy, power, botSide);
        if (!best || score > best.score) {
          best = { score, shot: { puckId: puck.id, dirX: dx, dirY: dy, power } };
        }
      }
    }
  }
  return best ? best.shot : null;
}

// Forward-simulate ONE shot on a clone of the puck array.
// Higher score = better outcome for the bot:
//   +large bonus if the shot puck crosses to opponent's half
//   +bonus for each ANY-color puck pushed deeper into opponent's half (chain reactions)
//   −penalty if the shot puck gets stuck near the wall
function simulateScore(
  pucks: Puck[],
  shotId: number,
  dirX: number,
  dirY: number,
  power: number,
  botSide: 0 | 1,
): number {
  // Deep-clone pucks so we don't mutate the live game.
  const clone: Puck[] = pucks.map(p => ({ ...p }));
  const shot = clone.find(p => p.id === shotId);
  if (!shot) return -Infinity;
  applySlingShot(shot, dirX, dirY, power);

  // Run up to 2 seconds of simulated time (120 steps @ dt=1/60).
  for (let i = 0; i < 120; i++) {
    const moving = step(clone);
    if (!moving) break;
  }

  const goalSign = botSide === 0 ? 1 : -1;
  // Score: how far into opponent's half is the shot puck?
  const shotDepth = clone.find(p => p.id === shotId)!.y * goalSign;
  let score = shotDepth * 8;
  if (shotDepth > 0.05) score += 5; // crossed!

  // Bonus: any of bot's OWN pucks that ended on opponent half.
  for (const p of clone) {
    if (p.side === botSide && p.y * goalSign > 0.05) score += 2;
    // Penalty: any of opponent-color pucks that ended on BOT's half.
    if (p.side !== botSide && p.y * goalSign < -0.05) score -= 1.5;
  }
  // Penalty: shot puck stuck very close to wall (didn't actually clear).
  if (Math.abs(clone.find(p => p.id === shotId)!.y) < PUCK.radius * 1.5) score -= 3;
  // Bounds penalty for safety.
  void BOARD;
  return score;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
void SLING;

export function planBotShot(state: MatchState, diff: Difficulty, botSide: 0 | 1 = 1) {
  const shot = planSlingShot(state, diff, botSide);
  if (!shot) return null;
  return { strikerX: 0, strikerY: 0, dirX: shot.dirX, dirY: shot.dirY, power: shot.power, puckId: shot.puckId };
}
