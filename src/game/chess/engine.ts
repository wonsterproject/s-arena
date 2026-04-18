// Chess Engine - rule enforcement, move generation, check/mate/draw detection
export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export interface Piece { type: PieceType; color: Color; hasMoved?: boolean }
export type Board = (Piece | null)[][]; // [row][col], row 0 = rank 8 (black back), row 7 = rank 1 (white back)

export interface Move {
  from: [number, number];
  to: [number, number];
  piece: Piece;
  captured?: Piece | null;
  promotion?: PieceType;
  castle?: "k" | "q";
  enPassant?: boolean;
}

export interface GameState {
  board: Board;
  turn: Color;
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
  enPassantTarget: [number, number] | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  history: Move[];
  positionHistory: string[]; // for threefold
}

export const initialBoard = (): Board => {
  const back: PieceType[] = ["r","n","b","q","k","b","n","r"];
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let i = 0; i < 8; i++) {
    b[0][i] = { type: back[i], color: "b" };
    b[1][i] = { type: "p", color: "b" };
    b[6][i] = { type: "p", color: "w" };
    b[7][i] = { type: back[i], color: "w" };
  }
  return b;
};

export const initialState = (): GameState => ({
  board: initialBoard(),
  turn: "w",
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  enPassantTarget: null,
  halfmoveClock: 0,
  fullmoveNumber: 1,
  history: [],
  positionHistory: [],
});

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const slideMoves = (board: Board, r: number, c: number, dirs: [number, number][]): [number, number][] => {
  const out: [number, number][] = [];
  const me = board[r][c]!.color;
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const t = board[nr][nc];
      if (!t) out.push([nr, nc]);
      else { if (t.color !== me) out.push([nr, nc]); break; }
      nr += dr; nc += dc;
    }
  }
  return out;
};

// Pseudo-legal moves (does not check for own king in check)
export const pseudoMoves = (state: GameState, r: number, c: number): [number, number][] => {
  const p = state.board[r][c];
  if (!p) return [];
  const me = p.color;
  const opp = me === "w" ? "b" : "w";
  const out: [number, number][] = [];

  if (p.type === "p") {
    const dir = me === "w" ? -1 : 1;
    const startRow = me === "w" ? 6 : 1;
    if (inBounds(r + dir, c) && !state.board[r + dir][c]) {
      out.push([r + dir, c]);
      if (r === startRow && !state.board[r + 2 * dir][c]) out.push([r + 2 * dir, c]);
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = state.board[nr][nc];
      if (t && t.color === opp) out.push([nr, nc]);
      // En passant
      if (state.enPassantTarget && state.enPassantTarget[0] === nr && state.enPassantTarget[1] === nc) {
        out.push([nr, nc]);
      }
    }
  } else if (p.type === "n") {
    const deltas: [number, number][] = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of deltas) {
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = state.board[nr][nc];
      if (!t || t.color !== me) out.push([nr, nc]);
    }
  } else if (p.type === "b") {
    out.push(...slideMoves(state.board, r, c, [[-1,-1],[-1,1],[1,-1],[1,1]]));
  } else if (p.type === "r") {
    out.push(...slideMoves(state.board, r, c, [[-1,0],[1,0],[0,-1],[0,1]]));
  } else if (p.type === "q") {
    out.push(...slideMoves(state.board, r, c, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]));
  } else if (p.type === "k") {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = state.board[nr][nc];
      if (!t || t.color !== me) out.push([nr, nc]);
    }
    // Castling (validity checked in legalMoves)
    if (me === "w" && r === 7 && c === 4) {
      if (state.castling.wK && !state.board[7][5] && !state.board[7][6]) out.push([7, 6]);
      if (state.castling.wQ && !state.board[7][1] && !state.board[7][2] && !state.board[7][3]) out.push([7, 2]);
    }
    if (me === "b" && r === 0 && c === 4) {
      if (state.castling.bK && !state.board[0][5] && !state.board[0][6]) out.push([0, 6]);
      if (state.castling.bQ && !state.board[0][1] && !state.board[0][2] && !state.board[0][3]) out.push([0, 2]);
    }
  }
  return out;
};

const findKing = (board: Board, color: Color): [number, number] | null => {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.type === "k" && p.color === color) return [r, c];
  }
  return null;
};

export const isSquareAttacked = (state: GameState, r: number, c: number, byColor: Color): boolean => {
  // Check pawn attacks
  const pdir = byColor === "w" ? 1 : -1; // attacker's pawn comes from this direction relative to target
  for (const dc of [-1, 1]) {
    const nr = r + pdir, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = state.board[nr][nc];
      if (p && p.color === byColor && p.type === "p") return true;
    }
  }
  // Knights
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as [number,number][]) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = state.board[nr][nc];
      if (p && p.color === byColor && p.type === "n") return true;
    }
  }
  // King adjacency
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc)) {
      const p = state.board[nr][nc];
      if (p && p.color === byColor && p.type === "k") return true;
    }
  }
  // Sliding: bishops/queens diagonally
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = state.board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "b" || p.type === "q")) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Rooks/queens straight
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = state.board[nr][nc];
      if (p) {
        if (p.color === byColor && (p.type === "r" || p.type === "q")) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
};

export const isInCheck = (state: GameState, color: Color): boolean => {
  const k = findKing(state.board, color);
  if (!k) return false;
  return isSquareAttacked(state, k[0], k[1], color === "w" ? "b" : "w");
};

export const cloneState = (s: GameState): GameState => ({
  board: s.board.map(row => row.map(p => p ? { ...p } : null)),
  turn: s.turn,
  castling: { ...s.castling },
  enPassantTarget: s.enPassantTarget ? [...s.enPassantTarget] as [number, number] : null,
  halfmoveClock: s.halfmoveClock,
  fullmoveNumber: s.fullmoveNumber,
  history: [...s.history],
  positionHistory: [...s.positionHistory],
});

// Legal moves for a piece: filter pseudo-moves by ensuring own king not in check
export const legalMoves = (state: GameState, r: number, c: number): [number, number][] => {
  const p = state.board[r][c];
  if (!p || p.color !== state.turn) return [];
  const candidates = pseudoMoves(state, r, c);
  const legal: [number, number][] = [];
  for (const [tr, tc] of candidates) {
    // Castling extra checks
    if (p.type === "k" && Math.abs(tc - c) === 2) {
      // King not currently in check
      if (isInCheck(state, p.color)) continue;
      // Squares king passes through not under attack
      const step = tc > c ? 1 : -1;
      let safe = true;
      for (let cc = c + step; cc !== tc + step; cc += step) {
        const test = cloneState(state);
        test.board[r][c] = null;
        test.board[r][cc] = { ...p };
        if (isSquareAttacked(test, r, cc, p.color === "w" ? "b" : "w")) { safe = false; break; }
      }
      if (!safe) continue;
    }
    const next = applyMoveRaw(state, r, c, tr, tc);
    if (!isInCheck(next, p.color)) legal.push([tr, tc]);
  }
  return legal;
};

// Apply a move without validation (returns new state)
const applyMoveRaw = (state: GameState, fr: number, fc: number, tr: number, tc: number, promotion: PieceType = "q"): GameState => {
  const next = cloneState(state);
  const p = next.board[fr][fc]!;
  const captured = next.board[tr][tc];
  let isEP = false;
  let castle: "k" | "q" | undefined;

  // En passant capture
  if (p.type === "p" && state.enPassantTarget && tr === state.enPassantTarget[0] && tc === state.enPassantTarget[1] && fc !== tc && !captured) {
    next.board[fr][tc] = null; // remove captured pawn
    isEP = true;
  }

  // Castling
  if (p.type === "k" && Math.abs(tc - fc) === 2) {
    if (tc > fc) { // king-side
      next.board[fr][5] = next.board[fr][7];
      next.board[fr][7] = null;
      if (next.board[fr][5]) next.board[fr][5]!.hasMoved = true;
      castle = "k";
    } else { // queen-side
      next.board[fr][3] = next.board[fr][0];
      next.board[fr][0] = null;
      if (next.board[fr][3]) next.board[fr][3]!.hasMoved = true;
      castle = "q";
    }
  }

  next.board[tr][tc] = { ...p, hasMoved: true };
  next.board[fr][fc] = null;

  // Promotion
  if (p.type === "p" && (tr === 0 || tr === 7)) {
    next.board[tr][tc] = { type: promotion, color: p.color, hasMoved: true };
  }

  // Update castling rights
  if (p.type === "k") {
    if (p.color === "w") { next.castling.wK = false; next.castling.wQ = false; }
    else { next.castling.bK = false; next.castling.bQ = false; }
  }
  if (p.type === "r") {
    if (p.color === "w" && fr === 7 && fc === 0) next.castling.wQ = false;
    if (p.color === "w" && fr === 7 && fc === 7) next.castling.wK = false;
    if (p.color === "b" && fr === 0 && fc === 0) next.castling.bQ = false;
    if (p.color === "b" && fr === 0 && fc === 7) next.castling.bK = false;
  }
  // Captured rook removes rights
  if (captured && captured.type === "r") {
    if (tr === 7 && tc === 0) next.castling.wQ = false;
    if (tr === 7 && tc === 7) next.castling.wK = false;
    if (tr === 0 && tc === 0) next.castling.bQ = false;
    if (tr === 0 && tc === 7) next.castling.bK = false;
  }

  // En passant target
  if (p.type === "p" && Math.abs(tr - fr) === 2) {
    next.enPassantTarget = [(fr + tr) / 2, fc];
  } else {
    next.enPassantTarget = null;
  }

  // Halfmove clock
  if (p.type === "p" || captured || isEP) next.halfmoveClock = 0;
  else next.halfmoveClock += 1;

  if (state.turn === "b") next.fullmoveNumber += 1;
  next.turn = state.turn === "w" ? "b" : "w";

  next.history.push({
    from: [fr, fc], to: [tr, tc], piece: p,
    captured: isEP ? { type: "p", color: p.color === "w" ? "b" : "w" } : (captured ?? null),
    promotion: (p.type === "p" && (tr === 0 || tr === 7)) ? promotion : undefined,
    castle,
    enPassant: isEP || undefined,
  });
  next.positionHistory.push(positionKey(next));
  return next;
};

export const tryMove = (state: GameState, fr: number, fc: number, tr: number, tc: number, promotion: PieceType = "q"): GameState | null => {
  const moves = legalMoves(state, fr, fc);
  if (!moves.some(([r, c]) => r === tr && c === tc)) return null;
  return applyMoveRaw(state, fr, fc, tr, tc, promotion);
};

export const allLegalMoves = (state: GameState): { from: [number, number]; to: [number, number] }[] => {
  const out: { from: [number, number]; to: [number, number] }[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = state.board[r][c];
    if (!p || p.color !== state.turn) continue;
    for (const [tr, tc] of legalMoves(state, r, c)) out.push({ from: [r, c], to: [tr, tc] });
  }
  return out;
};

export type GameStatus = "playing" | "check" | "checkmate" | "stalemate" | "draw-50" | "draw-3fold" | "draw-material";

export const positionKey = (s: GameState): string => {
  let k = s.turn + (s.castling.wK?"K":"") + (s.castling.wQ?"Q":"") + (s.castling.bK?"k":"") + (s.castling.bQ?"q":"") + "|";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = s.board[r][c];
    k += p ? (p.color === "w" ? p.type.toUpperCase() : p.type) : ".";
  }
  return k;
};

const insufficientMaterial = (b: Board): boolean => {
  const pieces: Piece[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c]) pieces.push(b[r][c]!);
  if (pieces.length === 2) return true; // K vs K
  if (pieces.length === 3) {
    const non = pieces.find(p => p.type !== "k");
    if (non && (non.type === "b" || non.type === "n")) return true;
  }
  return false;
};

export const getStatus = (state: GameState): GameStatus => {
  const moves = allLegalMoves(state);
  const inCheck = isInCheck(state, state.turn);
  if (moves.length === 0) return inCheck ? "checkmate" : "stalemate";
  if (state.halfmoveClock >= 100) return "draw-50";
  const key = positionKey(state);
  const reps = state.positionHistory.filter(k => k === key).length;
  if (reps >= 3) return "draw-3fold";
  if (insufficientMaterial(state.board)) return "draw-material";
  return inCheck ? "check" : "playing";
};
