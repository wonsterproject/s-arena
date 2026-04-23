// Sling Puck rules.
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
    turn: 0,
    pucks,
    discs: pucks, // alias same array
    striker: dummyStriker,
    message: "Player 1 to start. Pull a puck back to sling it through the gap.",
    winner: null,
    shotInProgress: false,
    lastFoul: null,
  };
}

// Default striker pos — kept as legacy stub (unused in sling mode).
export function defaultStrikerPos(_turn: 0 | 1): StrikerState {
  return { x: 0, y: 0, vx: 0, vy: 0, active: false };
}

// Legacy stubs (sling mode doesn't use striker placement).
export function isLegalPlacement(_turn: 0 | 1, _x: number, _y: number): boolean {
  return true;
}
export function clampPlacement(_turn: 0 | 1, x: number, y: number, _pucks: Puck[]): { x: number; y: number } {
  return { x, y };
}

// After a shot resolves, evaluate state.
export function resolveShot(state: MatchState, result: ShotResult): MatchState {
  const turn = state.turn;
  let foul: string | null = null;

  if (!result.hitAny) foul = "Weak shot — no movement!";

  // Win check: a player wins when they have ZERO of their own pucks remaining on their own half.
  // Bottom side (0) owns y < 0; top side (1) owns y > 0.
  // A puck "stays on own half" if y is on owner's side AND not in gap region.
  const onOwnHalf = (p: Puck) => {
    if (!p.alive) return false;
    if (p.side === 0) return p.y < -PUCK.radius * 0.2;
    return p.y > PUCK.radius * 0.2;
  };
  const countA = state.pucks.filter(p => p.side === 0 && onOwnHalf(p)).length;
  const countB = state.pucks.filter(p => p.side === 1 && onOwnHalf(p)).length;

  let winner: 0 | 1 | null = null;
  if (countA === 0 && countB === 0) winner = turn;
  else if (countA === 0) winner = 0;
  else if (countB === 0) winner = 1;

  // Always alternate turns in sling puck (each player gets one shot per turn).
  let nextTurn = turn;
  if (winner === null) nextTurn = (1 - turn) as 0 | 1;

  state.lastFoul = foul;
  state.turn = nextTurn;
  state.winner = winner;
  state.message = winner !== null
    ? `${state.players[winner].name} wins!`
    : foul
    ? `${foul} ${state.players[nextTurn].name}'s turn.`
    : `${state.players[nextTurn].name}'s turn.`;
  // keep aliases in sync
  state.discs = state.pucks;
  return state;
}

// Helper: which pucks belong to a side AND are still on their own half (eligible to sling).
export function ownPucksOnOwnHalf(state: MatchState, side: 0 | 1): Puck[] {
  return state.pucks.filter(p => {
    if (!p.alive || p.side !== side) return false;
    return side === 0 ? p.y < -PUCK.radius * 0.2 : p.y > PUCK.radius * 0.2;
  });
}

// Helper: sling anchor Y for a side.
export function slingAnchorY(side: 0 | 1) {
  return side === 0 ? SLING.anchorYA : SLING.anchorYB;
}

export { GAP, BOARD };
