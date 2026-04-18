// Chess AI using minimax + alpha-beta pruning
import { GameState, allLegalMoves, tryMove, isInCheck, Color } from "./engine";

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables (white perspective; flip for black)
const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];
const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];
const pst = (type: string, r: number, c: number, color: Color): number => {
  const idx = color === "w" ? r * 8 + c : (7 - r) * 8 + c;
  if (type === "p") return PST_PAWN[idx];
  if (type === "n") return PST_KNIGHT[idx];
  return 0;
};

const evaluate = (state: GameState): number => {
  let score = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = state.board[r][c];
    if (!p) continue;
    const v = VALUES[p.type] + pst(p.type, r, c, p.color);
    score += p.color === "w" ? v : -v;
  }
  return state.turn === "w" ? score : -score;
};

const orderMoves = (state: GameState, moves: { from: [number, number]; to: [number, number] }[]) => {
  return moves.map(m => {
    const target = state.board[m.to[0]][m.to[1]];
    const attacker = state.board[m.from[0]][m.from[1]];
    let score = 0;
    if (target && attacker) score = VALUES[target.type] * 10 - VALUES[attacker.type];
    return { m, score };
  }).sort((a, b) => b.score - a.score).map(x => x.m);
};

const negamax = (state: GameState, depth: number, alpha: number, beta: number): number => {
  if (depth === 0) return evaluate(state);
  const moves = allLegalMoves(state);
  if (moves.length === 0) {
    if (isInCheck(state, state.turn)) return -100000 + (10 - depth); // checkmate (prefer faster mate)
    return 0; // stalemate
  }
  let best = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const next = tryMove(state, m.from[0], m.from[1], m.to[0], m.to[1]);
    if (!next) continue;
    const score = -negamax(next, depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
};

export type Difficulty = "easy" | "medium" | "hard";

export const findBestMove = (state: GameState, difficulty: Difficulty): { from: [number, number]; to: [number, number] } | null => {
  const depth = difficulty === "easy" ? 1 : difficulty === "medium" ? 3 : 4;
  const moves = allLegalMoves(state);
  if (moves.length === 0) return null;

  // Easy: random selection from top-3 to feel beatable
  if (difficulty === "easy") {
    const scored = orderMoves(state, moves).slice(0, Math.max(3, Math.floor(moves.length / 3)));
    return scored[Math.floor(Math.random() * scored.length)];
  }

  let bestScore = -Infinity;
  let bestMove = moves[0];
  let alpha = -Infinity;
  for (const m of orderMoves(state, moves)) {
    const next = tryMove(state, m.from[0], m.from[1], m.to[0], m.to[1]);
    if (!next) continue;
    const score = -negamax(next, depth - 1, -Infinity, -alpha);
    if (score > bestScore) { bestScore = score; bestMove = m; }
    if (score > alpha) alpha = score;
  }
  return bestMove;
};
