import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Flag, Crown, Trophy, Bot, User as UserIcon, Loader2, Coins, Wifi } from "lucide-react";
import { initialState, GameState, tryMove, getStatus, isInCheck, Color } from "@/game/chess/engine";
import { findBestMove, Difficulty } from "@/game/chess/ai";
import ChessBoard from "@/components/chess/ChessBoard";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Mode = "bot" | "local" | "online";

interface OnlineMeta {
  matchId: string;
  myColor: Color;            // "w" or "b"
  opponentName: string;
  betAmount: number;
  hostId: string;
  opponentId: string | null;
  status: "waiting" | "active" | "finished" | "cancelled";
}

export default function ChessMatch() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const mode = (params.get("mode") || "bot") as Mode;
  const difficulty = (params.get("diff") || "medium") as Difficulty;
  const onlineMatchId = params.get("id");

  const [state, setState] = useState<GameState>(() => initialState());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [history, setHistory] = useState<GameState[]>([]);
  const [gameOver, setGameOver] = useState<string | null>(null);

  // Online state
  const [online, setOnline] = useState<OnlineMeta | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(mode === "online");
  const finalizingRef = useRef(false);
  // Paid bot match support
  const [paidBotBet, setPaidBotBet] = useState<number>(0);
  const paidBotFinalizedRef = useRef(false);

  // Load paid bot bet
  useEffect(() => {
    if (mode !== "bot" || !onlineMatchId || !user) return;
    if (onlineMatchId.startsWith("local-")) return;
    void (async () => {
      const { data: m } = await supabase.from("matches")
        .select("bet_amount, host_id, status").eq("id", onlineMatchId).maybeSingle();
      if (m && m.host_id === user.id && m.status !== "finished") setPaidBotBet(m.bet_amount ?? 0);
    })();
  }, [mode, onlineMatchId, user]);

  // For bot/local: human is white; for online: derived from match seat
  const playerColor: Color = mode === "online" ? (online?.myColor ?? "w") : "w";
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

  // ===== ONLINE: Load match + subscribe =====
  useEffect(() => {
    if (mode !== "online" || !onlineMatchId || !user) return;
    let cancelled = false;

    const init = async () => {
      // Load match
      const { data: m, error: mErr } = await supabase
        .from("matches")
        .select("id, host_id, status, bet_amount, state, game_type")
        .eq("id", onlineMatchId)
        .maybeSingle();
      if (cancelled) return;
      if (mErr || !m) {
        toast({ title: "Match not found", variant: "destructive" });
        navigate("/chess/lobby");
        return;
      }
      // Load players
      const { data: players } = await supabase
        .from("match_players")
        .select("user_id, color, is_bot")
        .eq("match_id", onlineMatchId);
      const me = (players ?? []).find((p) => p.user_id === user.id);
      const opp = (players ?? []).find((p) => p.user_id !== user.id);
      if (!me) {
        toast({ title: "You are not part of this match", variant: "destructive" });
        navigate("/chess/lobby");
        return;
      }
      // Color mapping: red seat = white, blue seat = black (host = white by convention)
      const myColor: Color = m.host_id === user.id ? "w" : "b";

      let oppName = "Opponent";
      if (opp?.user_id) {
        const { data: oppProfile } = await supabase
          .from("profiles")
          .select("username, display_name")
          .eq("id", opp.user_id)
          .maybeSingle();
        oppName = oppProfile?.display_name || oppProfile?.username || "Opponent";
      }

      setOnline({
        matchId: m.id,
        myColor,
        opponentName: oppName,
        betAmount: m.bet_amount ?? 0,
        hostId: m.host_id,
        opponentId: opp?.user_id ?? null,
        status: m.status as any,
      });

      // Load saved game state if any
      if (m.state && (m.state as any).board) {
        setState(m.state as unknown as GameState);
      }
      setLoadingOnline(false);
    };

    void init();

    // Realtime subscription on matches row
    const ch = supabase
      .channel(`chess-match-${onlineMatchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${onlineMatchId}` },
        (payload) => {
          const newRow: any = payload.new;
          if (newRow.state && newRow.state.board) {
            setState(newRow.state as GameState);
          }
          if (newRow.status === "finished") {
            setOnline((p) => p ? { ...p, status: "finished" } : p);
          }
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [mode, onlineMatchId, user, navigate]);

  // Push state to DB after my move (online only)
  const pushState = useCallback(async (next: GameState) => {
    if (mode !== "online" || !onlineMatchId) return;
    await supabase
      .from("matches")
      .update({ state: next as any, updated_at: new Date().toISOString() })
      .eq("id", onlineMatchId);
  }, [mode, onlineMatchId]);

  // Game over detection + finalize for online and paid bot
  useEffect(() => {
    if (status === "checkmate") {
      const winnerColor: Color = state.turn === "w" ? "b" : "w";
      const winnerName = winnerColor === "w" ? "White" : "Black";
      setGameOver(`Checkmate — ${winnerName} wins!`);

      if (mode === "online" && online && online.status !== "finished" && !finalizingRef.current) {
        finalizingRef.current = true;
        const winnerUserId = winnerColor === online.myColor ? user!.id : online.opponentId;
        if (winnerUserId) {
          supabase.rpc("finalize_match", { _match_id: online.matchId, _winner_id: winnerUserId })
            .then(() => refreshProfile());
        }
      }
      // Paid bot finalize (human is white = playerColor)
      if (mode === "bot" && paidBotBet > 0 && onlineMatchId && user && !paidBotFinalizedRef.current) {
        paidBotFinalizedRef.current = true;
        const humanWon = winnerColor === playerColor;
        supabase.rpc("finalize_match", {
          _match_id: onlineMatchId, _winner_id: humanWon ? user.id : null,
        }).then(() => refreshProfile());
      }
    } else if (status === "stalemate") setGameOver("Stalemate — Draw");
    else if (status === "draw-50") setGameOver("50-move rule — Draw");
    else if (status === "draw-3fold") setGameOver("Threefold repetition — Draw");
    else if (status === "draw-material") setGameOver("Insufficient material — Draw");
  }, [status, state.turn, mode, online, user, refreshProfile, paidBotBet, onlineMatchId, playerColor]);

  // Bot move (bot mode only)
  const botRunRef = useRef(false);
  useEffect(() => {
    if (mode !== "bot" || gameOver) return;
    if (state.turn === playerColor) return;
    if (botRunRef.current) return;
    botRunRef.current = true;
    setThinking(true);
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
    if (mode === "online") {
      if (!online || online.status === "waiting") {
        toast({ title: "Waiting for opponent to join…" });
        return;
      }
      if (state.turn !== online.myColor) {
        toast({ title: "Opponent's turn" });
        return;
      }
    }
    const piece = state.board[r][c];

    if (selected) {
      const [sr, sc] = selected;
      if (sr === r && sc === c) { setSelected(null); return; }
      const next = tryMove(state, sr, sc, r, c);
      if (next) {
        setHistory(h => [...h, state]);
        setState(next);
        setSelected(null);
        if (mode === "online") void pushState(next);
        return;
      }
      if (piece && piece.color === state.turn) { setSelected([r, c]); return; }
      setSelected(null);
      return;
    }
    if (piece && piece.color === state.turn) setSelected([r, c]);
  }, [selected, state, gameOver, thinking, mode, playerColor, online, pushState]);

  const undo = () => {
    if (mode === "online") return; // no undo in online
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
    if (mode === "online") return; // can't restart online
    setState(initialState());
    setHistory([]);
    setSelected(null);
    setGameOver(null);
  };

  const resign = async () => {
    if (mode !== "online" || !online || !user) return;
    if (online.status === "finished") return;
    if (!confirm("Resign? Opponent will win the bet pot.")) return;
    finalizingRef.current = true;
    if (online.opponentId) {
      const { error } = await supabase.rpc("finalize_match", {
        _match_id: online.matchId, _winner_id: online.opponentId,
      });
      if (!error) {
        setGameOver("You resigned. Opponent wins.");
        await refreshProfile();
      }
    }
  };

  const flipped = mode === "bot" ? false : (mode === "online" ? online?.myColor === "b" : state.turn === "b");

  // Loading screen for online
  if (mode === "online" && loadingOnline) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm">Loading match…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate("/chess/lobby")} className="glass-btn flex items-center gap-2 px-3 h-9 text-sm">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </button>
          <div className="flex items-center gap-2">
            {mode === "online" && online && (
              <div className="glass-btn h-9 px-3 text-xs flex items-center gap-2 bg-primary/10">
                <Wifi className="h-3 w-3 text-green-400" />
                <span>Online</span>
                {online.betAmount > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <Coins className="h-3 w-3" /> {online.betAmount * 2}
                  </span>
                )}
              </div>
            )}
            {mode !== "online" && (
              <>
                <button onClick={undo} disabled={history.length === 0 || thinking} className="glass-btn h-9 px-3 text-sm flex items-center gap-1 disabled:opacity-40">
                  <RotateCcw className="h-4 w-4" /> Undo
                </button>
                <button onClick={restart} className="glass-btn h-9 px-3 text-sm flex items-center gap-1">
                  <Flag className="h-4 w-4" /> Restart
                </button>
              </>
            )}
            {mode === "online" && online && online.status !== "finished" && !gameOver && (
              <button onClick={resign} className="glass-btn h-9 px-3 text-sm flex items-center gap-1 text-red-400">
                <Flag className="h-4 w-4" /> Resign
              </button>
            )}
          </div>
        </div>

        {mode === "online" && online?.status === "waiting" && (
          <div className="glass rounded-xl p-3 mb-3 text-center text-sm text-yellow-300 animate-pulse">
            Waiting for @{online.opponentName} to accept the invite…
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr,280px] gap-4">
          <div>
            <PlayerBar
              name={
                mode === "bot" ? `CPU (${difficulty})`
                  : mode === "online" ? `@${online?.opponentName ?? "Opponent"}`
                  : "Black"
              }
              isBot={mode === "bot"}
              isActive={mode === "online" ? state.turn !== online?.myColor : state.turn === "b"}
              color={mode === "online" ? (online?.myColor === "w" ? "b" : "w") : "b"}
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
              name={mode === "bot" ? "You" : mode === "online" ? "You" : "White"}
              isActive={mode === "online" ? state.turn === online?.myColor : state.turn === "w"}
              color={mode === "online" ? (online?.myColor ?? "w") : "w"}
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
              {mode === "online" && online && online.betAmount > 0 && (
                <p className="text-sm text-muted-foreground mb-2">
                  Pot: <span className="text-yellow-400 font-bold">🪙 {online.betAmount * 2}</span>
                </p>
              )}
              <div className="flex gap-2 mt-6">
                {mode !== "online" && (
                  <button onClick={restart} className="glass-btn flex-1 h-11 bg-gradient-to-r from-primary/40 to-accent/40 font-bold">
                    Play Again
                  </button>
                )}
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
