import { useMemo } from "react";
import { Board, GameState, legalMoves, Piece } from "@/game/chess/engine";

const GLYPH: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};

interface Props {
  state: GameState;
  selected: [number, number] | null;
  flipped?: boolean;
  myColor?: "w" | "b";
  onSquareClick: (r: number, c: number) => void;
  lastMove?: { from: [number, number]; to: [number, number] } | null;
  inCheckSquare?: [number, number] | null;
}

export default function ChessBoard({ state, selected, flipped, myColor, onSquareClick, lastMove, inCheckSquare }: Props) {
  const validTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    const moves = legalMoves(state, selected[0], selected[1]);
    return new Set(moves.map(([r, c]) => `${r},${c}`));
  }, [selected, state]);

  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="aspect-square w-full max-w-[560px] mx-auto rounded-2xl overflow-hidden shadow-[0_30px_80px_-20px_hsl(var(--primary)/0.5)] ring-2 ring-primary/30">
      <div className="grid grid-cols-8 grid-rows-8 h-full w-full">
        {rows.map(r => cols.map(c => {
          const piece = state.board[r][c];
          const isLight = (r + c) % 2 === 0;
          const isSel = selected && selected[0] === r && selected[1] === c;
          const isTarget = validTargets.has(`${r},${c}`);
          const isLast = lastMove && ((lastMove.from[0] === r && lastMove.from[1] === c) || (lastMove.to[0] === r && lastMove.to[1] === c));
          const isCheck = inCheckSquare && inCheckSquare[0] === r && inCheckSquare[1] === c;
          return (
            <button
              key={`${r}-${c}`}
              onClick={() => onSquareClick(r, c)}
              className={`relative flex items-center justify-center transition-all
                ${isLight ? "bg-amber-100" : "bg-amber-700"}
                ${isSel ? "ring-4 ring-inset ring-primary" : ""}
                ${isLast ? "ring-2 ring-inset ring-yellow-300/80" : ""}
                ${isCheck ? "bg-red-500/70 animate-pulse" : ""}
              `}
            >
              {piece && (
                <span
                  className={`text-[clamp(1.5rem,5vw,3rem)] leading-none select-none ${piece.color === "w" ? "text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]" : "text-black drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]"}`}
                  style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
                >
                  {GLYPH[piece.color + piece.type.toUpperCase()]}
                </span>
              )}
              {isTarget && !piece && (
                <span className="absolute h-3 w-3 rounded-full bg-primary/60 shadow-lg" />
              )}
              {isTarget && piece && (
                <span className="absolute inset-1 rounded-full ring-4 ring-red-500/70" />
              )}
              {/* Coordinate labels on edges */}
              {c === (flipped ? 7 : 0) && (
                <span className="absolute top-0.5 left-1 text-[10px] font-bold opacity-50">{8 - r}</span>
              )}
              {r === (flipped ? 0 : 7) && (
                <span className="absolute bottom-0.5 right-1 text-[10px] font-bold opacity-50">{String.fromCharCode(97 + c)}</span>
              )}
            </button>
          );
        }))}
      </div>
    </div>
  );
}
