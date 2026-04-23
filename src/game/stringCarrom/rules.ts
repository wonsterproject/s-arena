// Sling Puck rules — TURN-LESS mode.
// Both players sling simultaneously. The winner is the player who FIRST
// has zero of their own-colored pucks remaining on their own half
// (i.e. they pushed all their pucks across to the opponent's side).
import { initialPucks, BOARD, PUCK, SLING, GAP } from "./constants";
import type { MatchState, ShotResult, Player, Puck, StrikerState } from "./types";

export function createMatch(p1Name: string, p2Name: string, botSide: 0 | 1 | null): MatchState {
  const players: [Player, Player] = [
    { name: p1Name, isBot: botSide === 0 },
    { name: p2Name, isBot: botSide === 1 },
  ];
  const pucks: Puck[] = initialPucks().map(p => ({
    id: p.id, side: p.side, x: p.x, y: p.y, vx: 0, vy: 0, alive: true,
  }));
  const dummyStriker: StrikerState = { x: 0, y: 0, vx: 0, vy: 0, active: false };
  return {
    players,
    turn: 0, // unused in turn-less mode but kept for legacy types
    pucks,
    discs: pucks,
    striker: dummyStriker,
    message: "Get ready! Sling your pucks across the gap.",
    winner: null,
    shotInProgress: false,
    lastFoul: null,
  };
}

export function defaultStrikerPos(_turn: 0 | 1): StrikerState {
  return { x: 0, y: 0, vx: 0, vy: 0, active: false };
}
export function isLegalPlacement(_turn: 0 | 1, _x: number, _y: number): boolean { return true; }
export function clampPlacement(_turn: 0 | 1, x: number, y: number, _pucks: Puck[]): { x: number; y: number } {
  return { x, y };
}

// In turn-less mode, the rules engine just checks for a winner.
// A player wins when ALL of their own-colored pucks are off their own half.
export function checkWinner(state: MatchState): 0 | 1 | null {
  const ownCount = (side: 0 | 1) =>
    state.pucks.filter(p => p.alive && p.side === side && isOnOwnHalf(p)).length;
  const a = ownCount(0);
  const b = ownCount(1);
  if (a === 0 && b === 0) return 0; // tie-breaker: bottom (player) wins
  if (a === 0) return 0;
  if (b === 0) return 1;
  return null;
}

// Legacy: kept so older code paths compile. In turn-less mode, callers should use
// checkWinner() after each physics tick instead of resolveShot().
export function resolveShot(state: MatchState, _result: ShotResult): MatchState {
  const w = checkWinner(state);
  state.winner = w;
  state.discs = state.pucks;
  if (w !== null) state.message = `${state.players[w].name} wins!`;
  return state;
}

function isOnOwnHalf(p: Puck): boolean {
  if (p.side === 0) return p.y < -PUCK.radius * 0.2;
  return p.y > PUCK.radius * 0.2;
}

export function ownPucksOnOwnHalf(state: MatchState, side: 0 | 1): Puck[] {
  return state.pucks.filter(p => p.alive && p.side === side && isOnOwnHalf(p));
}

// Pucks of `side` (color) currently on the OPPONENT'S half — these are the ones
// the opponent might want to throw back.
export function pucksOnOpponentHalf(state: MatchState, color: 0 | 1): Puck[] {
  return state.pucks.filter(p => {
    if (!p.alive || p.side !== color) return false;
    return color === 0 ? p.y > PUCK.radius * 0.2 : p.y < -PUCK.radius * 0.2;
  });
}

export function slingAnchorY(side: 0 | 1) {
  return side === 0 ? SLING.anchorYA : SLING.anchorYB;
}

export { GAP, BOARD };
