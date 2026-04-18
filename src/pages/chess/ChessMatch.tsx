import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Flag, Crown, Trophy, Bot, User as UserIcon } from "lucide-react";
import { initialState, GameState, tryMove, getStatus, isInCheck, allLegalMoves, Color } from "@/game/chess/engine";
import { findBestMove, Difficulty } from "@/game/chess/ai";
import ChessBoard from "@/components/chess/ChessBoard";
import { toast } from "@/hooks/use-toast";

export default function ChessMatch() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") || "bot"; // bot | local
  const difficulty = (params.get("diff") || "medium") as Difficulty;

  const [state, setState] = useState<GameState>(() => initialState());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<GameState[]>([]);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const playerColor: Color = "w"; // human always white when vs bot
  const lastMove = state.history.length > 0 ? state.history[state.history.length - 1] : null;

  const status = useMemo(() => getStatus(state), [state]);

  const checkSquare = useMemo<[number, number] | null>(() => {
    if (!isInCheck(state, state.turn)) return null;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.type === "k" && p.color === state.turn) return [r, c];
    }
    return null;
  }, [state]);

  // Game over detection
  useEffect(() => {
    if (status === "checkmate") {
      const winner = state.turn === "w" ? "Black" : "White";
      setGameOver(`Checkmate — ${winner} wins!`);
    } else if (status === "stalemate") setGameOver("Stalemate — Draw");
    else if (status === "draw-50") setGameOver("50-move rule — Draw");
    else if (status === "draw-3fold") setGameOver("Threefold repetition — Draw");
    else if (status === "draw-material") setGameOver("Insufficient material — Draw");
    else if (status === "check") {
      // toast non-blocking
    }
  }, [status, state.turn]);

  // Bot move
  const botRunRef = useRef(false);
  useEffect(() => {
    if (mode !== "bot" || gameOver) return;
    if (state.turn === playerColor) return;
    if (botRunRef.current) return;
    botRunRef.current = true;
    setThinking(true);
    // defer so UI updates
    const t = setTimeout(() => {
      try {
        const move = findBestMove(state, difficulty);
        if (move) {
          const next = tryMove(state, move.from[0], move.from[1], move.to[0], move.to[1]);
          if (next) {
            setHistory(h => [...h, state]);
            setState(next);
          }
        }
      } finally {
        setThinking(false);
        botRunRef.current = false;
      }
    }, 200);
    return () => clearTimeout(t);
  }, [state, mode, difficulty, gameOver, playerColor]);

  const onSquareClick = useCallback((r: number, c: number) => {
    if (gameOver || thinking) return;
    if (mode === "bot" && state.turn !== playerColor) return;
    const piece = state.board[r][c];

    if (selected) {
      const [sr, sc] = selected;
      if (sr === r && sc === c) { setSelected(null); return; }
      // try move
      const next = tryMove(state, sr, sc, r, c);
      if (next) {
        setHistory(h => [...h, state]);
        setState(next);
        setSelected(null);
        return;
      }
      // re-select if clicked own piece
      if (piece && piece.color === state.turn) { setSelected([r, c]); return; }
      setSelected(null);
      return;
    }
    if (piece && piece.color === state.turn) setSelected([r, c]);
  }, [selected, state, gameOver, thinking, mode, playerColor]);

  const undo = () => {
    if (history.length === 0) return;
    const stepsBack = mode === "bot" && history.length >= 2 ? 2 : 1;
    const newHist = history.slice(0, -stepsBack);
    const target = history[history.length - stepsBack];
    setHistory(newHist);
    setState(target);
    setGameOver(null);
    setSelected(null);
  };

  const restart = () => {
    setState(initialState());
    setHistory([]);
    setSelected(null);
    setGameOver(null);
  };

  const flipped = mode === "bot" ? false : state.turn === "b";

  return (
    <main className="min-h-screen px-3 py-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/chess/lobby")} className="glass-btn flex items-center gap-2 px-3 h-9 text-sm">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </button>
          <div className="flex items-center gap-2">
            <button onClick={undo} disabled={history.length === 0 || thinking} className="glass-btn h-9 px-3 text-sm flex items-center gap-1 disabled:opacity-40">
              <RotateCcw className="h-4 w-4" /> Undo
            </button>
            <button onClick={restart} className="glass-btn h-9 px-3 text-sm flex items-center gap-1">
              <Flag className="h-4 w-4" /> Restart
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr,280px] gap-4">
          <div>
            <PlayerBar
              name={mode === "bot" ? `CPU (${difficulty})` : "Black"}
              isBot={mode === "bot"}
              isActive={state.turn === "b"}
              color="b"
            />
            <div className="my-2">
              <ChessBoard
                state={state}
                selected={selected}
                onSquareClick={onSquareClick}
                flipped={flipped}
                lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
                inCheckSquare={checkSquare}
              />
            </div>
            <PlayerBar
              name={mode === "bot" ? "You" : "White"}
              isActive={state.turn === "w"}
              color="w"
            />
          </div>

          <aside className="glass rounded-2xl p-4 space-y-3 max-h-[600px] overflow-hidden flex flex-col">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Move History</h3>
            <div className="flex-1 overflow-y-auto text-xs font-mono space-y-1">
              {state.history.length === 0 && <div className="text-muted-foreground italic">No moves yet</div>}
              {Array.from({ length: Math.ceil(state.history.length / 2) }).map((_, i) => {
                const wMove = state.history[i * 2];
                const bMove = state.history[i * 2 + 1];
                return (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground w-6">{i + 1}.</span>
                    <span className="w-16">{wMove ? notation(wMove) : ""}</span>
                    <span>{bMove ? notation(bMove) : ""}</span>
                  </div>
                );
              })}
            </div>
            {status === "check" && !gameOver && (
              <div className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-2 text-sm text-red-300 font-bold animate-pulse">
                ⚠️ Check!
              </div>
            )}
            {thinking && (
              <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary flex items-center gap-2">
                <Bot className="h-4 w-4 animate-pulse" /> CPU thinking…
              </div>
            )}
          </aside>
        </div>

        {gameOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="glass rounded-3xl p-8 max-w-sm w-full text-center neon-border animate-fade-in">
              <Trophy className="h-16 w-16 mx-auto text-yellow-400 mb-3" />
              <h2 className="text-2xl font-black mb-2">{gameOver}</h2>
              <div className="flex gap-2 mt-6">
                <button onClick={restart} className="glass-btn flex-1 h-11 bg-gradient-to-r from-primary/40 to-accent/40 font-bold">
                  Play Again
                </button>
                <button onClick={() => navigate("/chess/lobby")} className="glass-btn flex-1 h-11">
                  Lobby
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function PlayerBar({ name, isActive, color, isBot }: { name: string; isActive: boolean; color: "w" | "b"; isBot?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-all ${isActive ? "bg-primary/20 ring-2 ring-primary/60" : "bg-muted/20"}`}>
      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${color === "w" ? "bg-amber-100 text-black" : "bg-zinc-900 text-white"}`}>
        {isBot ? <Bot className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
      </div>
      <span className="font-bold text-sm">{name}</span>
      {isActive && <span className="ml-auto text-xs uppercase tracking-wider text-primary font-bold animate-pulse">Turn</span>}
    </div>
  );
}

const FILE = ["a","b","c","d","e","f","g","h"];
const notation = (m: any): string => {
  const piece = m.piece.type === "p" ? "" : m.piece.type.toUpperCase();
  const cap = m.captured ? "x" : "";
  const sq = `${FILE[m.to[1]]}${8 - m.to[0]}`;
  if (m.castle === "k") return "O-O";
  if (m.castle === "q") return "O-O-O";
  return `${piece}${cap}${sq}${m.promotion ? "=" + m.promotion.toUpperCase() : ""}`;
};
