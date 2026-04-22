import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, BookOpen, Volume2, VolumeX, X, Wifi, Coins, Loader2 } from "lucide-react";
import CarromScene, { type CarromSceneApi } from "@/components/carrom/CarromScene";
import { createMatch, resolveShot } from "@/game/carrom/rules";
import { planBotShot, type Difficulty } from "@/game/carrom/bot";
import { BOARD, type PieceColor } from "@/game/carrom/constants";
import type { MatchState } from "@/game/carrom/types";
import GameTopBar from "@/components/game/GameTopBar";
import { useCarromSounds } from "@/game/carrom/useCarromSounds";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Mode = "bot" | "local" | "online";

interface OnlineMeta {
  matchId: string;
  mySide: 0 | 1;
  opponentName: string;
  opponentId: string | null;
  betAmount: number;
  status: "waiting" | "active" | "finished" | "cancelled";
}

export default function CarromMatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "bot") as Mode;
  const diff = (params.get("diff") || "medium") as Difficulty;
  const onlineMatchId = params.get("id");
  const { user, refreshProfile } = useAuth();

  const apiRef = useRef<CarromSceneApi | null>(null);
  const [match, setMatch] = useState<MatchState>(() =>
    createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ),
  );
  const [shooting, setShooting] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const playSound = useCarromSounds(soundOn);
  const collisionUnsubRef = useRef<(() => void) | null>(null);
  const lastCollideAt = useRef(0);

  const [online, setOnline] = useState<OnlineMeta | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(mode === "online");
  const finalizingRef = useRef(false);
  const skipNextPushRef = useRef(false);
  const [paidBotBet, setPaidBotBet] = useState<number>(0);
  const paidBotFinalizedRef = useRef(false);

  // ===== ONLINE: load + subscribe =====
  useEffect(() => {
    if (mode !== "online" || !onlineMatchId || !user) return;
    let cancelled = false;
    const init = async () => {
      const { data: m, error } = await supabase
        .from("matches").select("id, host_id, status, bet_amount, state")
        .eq("id", onlineMatchId).maybeSingle();
      if (cancelled) return;
      if (error || !m) { toast({ title: "Match not found", variant: "destructive" }); navigate("/carrom/lobby"); return; }
      const { data: players } = await supabase
        .from("match_players").select("user_id, color").eq("match_id", onlineMatchId);
      const me = (players ?? []).find(p => p.user_id === user.id);
      const opp = (players ?? []).find(p => p.user_id !== user.id);
      if (!me) { toast({ title: "Not part of this match", variant: "destructive" }); navigate("/carrom/lobby"); return; }
      const mySide: 0 | 1 = m.host_id === user.id ? 0 : 1;
      let oppName = "Opponent";
      if (opp?.user_id) {
        const { data: oppP } = await supabase.from("profiles")
          .select("username, display_name").eq("id", opp.user_id).maybeSingle();
        oppName = oppP?.display_name || oppP?.username || "Opponent";
      }
      const meName = "You";
      const startMatch = createMatch(
        mySide === 0 ? meName : oppName,
        mySide === 0 ? oppName : meName,
        null,
      );
      setMatch((m.state && (m.state as any).pieces) ? (m.state as any) : startMatch);
      setOnline({ matchId: m.id, mySide, opponentName: oppName, opponentId: opp?.user_id ?? null,
        betAmount: m.bet_amount ?? 0, status: m.status as any });
      setLoadingOnline(false);
    };
    void init();

    const ch = supabase.channel(`carrom-match-${onlineMatchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${onlineMatchId}` },
        (payload) => {
          const newRow: any = payload.new;
          if (newRow.state && newRow.state.pieces) {
            skipNextPushRef.current = true;
            setMatch(newRow.state as MatchState);
            // Snap visual pieces to authoritative state
            setTimeout(() => apiRef.current?.respawnQueen?.(), 0);
          }
          if (newRow.status === "finished") setOnline(p => p ? { ...p, status: "finished" } : p);
        }).subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [mode, onlineMatchId, user, navigate]);

  const pushState = useCallback(async (next: MatchState) => {
    if (mode !== "online" || !onlineMatchId) return;
    await supabase.from("matches")
      .update({ state: next as any, updated_at: new Date().toISOString() })
      .eq("id", onlineMatchId);
  }, [mode, onlineMatchId]);

  // Paid bot match: load bet
  useEffect(() => {
    if (mode !== "bot" || !onlineMatchId || !user) return;
    if (onlineMatchId.startsWith("local-")) return;
    void (async () => {
      const { data: m } = await supabase.from("matches")
        .select("bet_amount, host_id, status").eq("id", onlineMatchId).maybeSingle();
      if (m && m.host_id === user.id && m.status !== "finished") setPaidBotBet(m.bet_amount ?? 0);
    })();
  }, [mode, onlineMatchId, user]);

  const finalizePaidBot = useCallback(async (humanWon: boolean) => {
    if (paidBotFinalizedRef.current || mode !== "bot" || !onlineMatchId || !user || paidBotBet <= 0) return;
    if (onlineMatchId.startsWith("local-")) return;
    paidBotFinalizedRef.current = true;
    const { error } = await supabase.rpc("finalize_match", {
      _match_id: onlineMatchId, _winner_id: humanWon ? user.id : null,
    });
    if (!error) await refreshProfile();
  }, [mode, onlineMatchId, user, paidBotBet, refreshProfile]);

  useEffect(() => {
    if (!apiRef.current) return;
    const z = match.turn === 0 ? BOARD.baselineY : -BOARD.baselineY;
    apiRef.current.setStrikerPosition(0, z);
  }, [match.turn]);

  useEffect(() => {
    if (match.winner !== null) playSound("win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.winner]);

  useEffect(() => () => { collisionUnsubRef.current?.(); }, []);

  // Bot turn (bot mode only)
  useEffect(() => {
    if (mode !== "bot" || match.winner !== null) return;
    const me = match.players[match.turn];
    if (!me.isBot || shooting) return;
    const t = setTimeout(() => {
      if (!apiRef.current) return;
      const piecesSnapshot = (apiRef.current as any)._piecesSnapshot?.() ?? [];
      const fallback = { strikerX: 0, strikerZ: me.side === 0 ? BOARD.baselineY : -BOARD.baselineY, dirX: 0, dirZ: me.side === 0 ? -1 : 1, power: 0.75 };
      const shot = piecesSnapshot.length ? planBotShot(match, piecesSnapshot, diff) : fallback;
      apiRef.current.setStrikerPosition(shot.strikerX, shot.strikerZ);
      setShooting(true);
      setTimeout(() => apiRef.current!.shoot(shot.dirX, shot.dirZ, shot.power), 600);
    }, 900);
    return () => clearTimeout(t);
  }, [mode, match.turn, match.winner, shooting, diff, match]);

  const handleShootRequest = (dirX: number, dirZ: number, power: number, sx: number, sz: number) => {
    if (shooting || match.winner !== null) return;
    if (!apiRef.current) return;
    if (mode === "online" && online && match.turn !== online.mySide) {
      toast({ title: "Opponent's turn" });
      return;
    }
    apiRef.current.setStrikerPosition(sx, sz);
    setShooting(true);
    playSound("strike");
    apiRef.current.shoot(dirX, dirZ, power);
  };

  const handleShotResolved = (info: { piecesPocketed: string[]; strikerPocketed: boolean; hitAny: boolean; firstContact: PieceColor | "striker" | null }) => {
    if (info.strikerPocketed) playSound("foul");
    else if (info.piecesPocketed.length > 0) playSound("pocket");

    setMatch(prev => {
      const next: MatchState = JSON.parse(JSON.stringify(prev));
      const pocketedColors: PieceColor[] = [];
      for (const id of info.piecesPocketed) {
        const p = next.pieces.find(pp => pp.id === id);
        if (p && !p.pocketed) { p.pocketed = true; pocketedColors.push(p.color); }
      }
      const queenWasPendingBefore = prev.queenPocketedPending;
      const queenOwnerBefore = prev.queenOwnerPending;
      const updated = resolveShot(next, {
        pocketedThisShot: pocketedColors,
        strikerPocketed: info.strikerPocketed,
        hitAny: info.hitAny,
        firstContactColor: info.firstContact,
      });
      if (queenWasPendingBefore && queenOwnerBefore === prev.turn && !updated.queenPocketedPending) {
        const q = updated.pieces.find(p => p.color === "queen");
        if (q && q.pocketed) {
          q.pocketed = false;
          setTimeout(() => apiRef.current?.respawnQueen(), 50);
        }
      }
      // Online: push the resolved state, only if I shot (not on remote-applied updates)
      if (mode === "online" && online && !skipNextPushRef.current) {
        void pushState(updated);
        // Finalize bet on win
        if (updated.winner !== null && online.status !== "finished" && !finalizingRef.current) {
          finalizingRef.current = true;
          const winnerUserId = updated.winner === online.mySide ? user!.id : online.opponentId;
          if (winnerUserId) {
            supabase.rpc("finalize_match", { _match_id: online.matchId, _winner_id: winnerUserId })
              .then(() => refreshProfile());
          }
        }
      }
      // Paid bot finalize (human is side 0)
      if (mode === "bot" && updated.winner !== null && paidBotBet > 0) {
        void finalizePaidBot(updated.winner === 0);
      }
      skipNextPushRef.current = false;
      return updated;
    });
    setShooting(false);
  };

  const restart = () => {
    if (mode === "online") return;
    setMatch(createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ));
    window.location.reload();
  };

  const resign = async () => {
    if (mode !== "online" || !online || !user) return;
    if (online.status === "finished") return;
    if (!confirm("Resign? Opponent wins the bet pot.")) return;
    finalizingRef.current = true;
    if (online.opponentId) {
      const { error } = await supabase.rpc("finalize_match", {
        _match_id: online.matchId, _winner_id: online.opponentId,
      });
      if (!error) {
        toast({ title: "You resigned" });
        await refreshProfile();
      }
    }
  };

  const me = match.players[match.turn];
  const isMyTurn = mode === "online" && online ? match.turn === online.mySide : !me.isBot;
  const isHumanTurn = isMyTurn && !shooting && match.winner === null;

  const you = match.players[mode === "online" && online ? online.mySide : 0];
  const opp = match.players[mode === "online" && online ? (1 - online.mySide) as 0 | 1 : 1];
  const colorsAssigned = !!you.color;

  const titleText = match.winner !== null
    ? `${match.players[match.winner].name} wins!`
    : isMyTurn ? "Your Turn" : "Opponent's Turn";
  const subtitle = match.winner !== null
    ? "Game Over"
    : shooting ? (match.message || "Shot in progress...")
    : !colorsAssigned ? "Pocket any coin to claim your color"
    : isMyTurn ? "Aiming Shot..." : (mode === "bot" ? "Thinking..." : "Waiting...");

  const ColorDot = ({ c }: { c: "white" | "black" | null }) => (
    <span className="inline-block h-3 w-3 rounded-full border border-white/30"
      style={{
        background: c === "white" ? "hsl(45 30% 85%)" : c === "black" ? "hsl(0 0% 15%)" : "hsl(0 0% 40%)",
        boxShadow: c ? "0 0 6px hsl(45 100% 60% / 0.5)" : undefined,
      }}
    />
  );

  if (mode === "online" && loadingOnline) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="rounded-2xl p-8 text-center bg-card border border-border">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="text-sm">Loading match…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-2 py-2 sm:py-3 overflow-hidden">
      <div className="max-w-5xl mx-auto flex flex-col h-screen">
        <GameTopBar
          title={titleText}
          subtitle={subtitle}
          onBack={() => navigate(mode === "online" ? "/carrom/lobby" : "/carrom/lobby")}
          onRestart={mode === "online" ? resign : restart}
        />

        {mode === "online" && online && (
          <div className="flex items-center justify-center gap-2 px-3 py-1 mb-1 rounded-xl text-xs bg-primary/10 border border-primary/30">
            <Wifi className="h-3 w-3 text-green-400" />
            <span className="font-bold">Online vs @{online.opponentName}</span>
            {online.betAmount > 0 && (
              <span className="flex items-center gap-1 text-yellow-400 font-bold">
                <Coins className="h-3 w-3" /> Pot {online.betAmount * 2}
              </span>
            )}
            {online.status === "waiting" && <span className="text-yellow-300 animate-pulse">Waiting…</span>}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1 rounded-xl text-xs"
          style={{ background: "linear-gradient(180deg, hsl(232 50% 14% / 0.9), hsl(232 55% 8% / 0.9))",
                   boxShadow: "0 0 0 1px hsl(45 100% 60% / 0.25) inset" }}>
          <div className="flex items-center gap-1.5 font-bold text-white">
            <ColorDot c={you.color} /><span>You</span>
            <span className="text-amber-300">{you.score}</span>
            {you.queenCovered && <span className="text-red-400">♛</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowRules(true)} aria-label="Show rules"
              className="h-7 w-7 grid place-items-center rounded-lg text-white/90 hover:text-white transition"
              style={{ background: "hsl(232 50% 22% / 0.7)", boxShadow: "0 0 0 1px hsl(45 100% 60% / 0.3) inset" }}>
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setSoundOn(s => !s)} aria-label={soundOn ? "Mute" : "Unmute"}
              className="h-7 w-7 grid place-items-center rounded-lg text-white/90 hover:text-white transition"
              style={{ background: "hsl(232 50% 22% / 0.7)", boxShadow: "0 0 0 1px hsl(45 100% 60% / 0.3) inset" }}>
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-white">
            {opp.queenCovered && <span className="text-red-400">♛</span>}
            <span className="text-amber-300">{opp.score}</span>
            <span>{opp.name}</span><ColorDot c={opp.color} />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="rounded-2xl overflow-hidden"
            style={{ width: "min(100%, calc(100vh - 150px))", height: "min(100%, calc(100vh - 150px))",
                     aspectRatio: "1 / 1",
                     boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.4) inset, 0 6px 24px rgba(0,0,0,0.6)" }}>
            <CarromScene
              onReady={(api) => {
                apiRef.current = api;
                api.setStrikerPosition(0, BOARD.baselineY);
                collisionUnsubRef.current?.();
                collisionUnsubRef.current = api.onCollision(({ speed }) => {
                  const now = performance.now();
                  if (now - lastCollideAt.current < 55) return;
                  lastCollideAt.current = now;
                  if (speed > 0.5) playSound("collide");
                });
              }}
              onShotResolved={handleShotResolved}
              currentSide={match.turn}
              shooting={shooting}
              interactive={isHumanTurn}
              onShootRequest={handleShootRequest}
            />
          </div>
        </div>

        {match.winner !== null && (
          <div className="rounded-2xl p-6 mt-3 text-center"
            style={{ background: "linear-gradient(180deg, hsl(232 50% 16%), hsl(232 55% 9%))",
                     boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 0 22px hsl(45 100% 60% / 0.3)" }}>
            <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
            <h2 className="text-2xl font-black mb-1 text-white">{match.players[match.winner].name} wins!</h2>
            {mode === "online" && online && online.betAmount > 0 && (
              <p className="text-sm text-amber-300 mb-2">Pot: {online.betAmount * 2} coins</p>
            )}
            <button onClick={mode === "online" ? () => navigate("/carrom/lobby") : restart}
              className="mt-3 h-11 px-7 rounded-2xl font-black text-white"
              style={{ background: "linear-gradient(180deg, hsl(28 100% 60%), hsl(20 100% 45%))",
                       boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 4px 12px rgba(0,0,0,0.5)" }}>
              {mode === "online" ? "Back to Lobby" : "Play Again"}
            </button>
          </div>
        )}
      </div>

      {showRules && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowRules(false)}>
          <div className="max-w-md w-full max-h-[85vh] overflow-y-auto rounded-2xl p-5 text-white text-sm"
            style={{ background: "linear-gradient(180deg, hsl(232 55% 14%), hsl(232 60% 7%))",
                     boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 12px 40px rgba(0,0,0,0.7)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-black tracking-wide flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-amber-300" /> Carrom Rules
              </h3>
              <button onClick={() => setShowRules(false)} aria-label="Close"
                className="h-8 w-8 grid place-items-center rounded-lg text-white/80 hover:text-white"
                style={{ background: "hsl(232 50% 22%)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2.5 leading-snug">
              <li><span className="text-amber-300 font-bold">⚪ Color:</span> First to pocket claims that color.</li>
              <li><span className="text-amber-300 font-bold">🎯 Goal:</span> Pocket all your coins AND cover the queen.</li>
              <li><span className="text-amber-300 font-bold">👑 Queen:</span> Cover by pocketing your color same/next shot.</li>
              <li><span className="text-amber-300 font-bold">🔁 Turn:</span> Pocket your color → continue. Miss/foul → opponent.</li>
              <li><span className="text-amber-300 font-bold">❌ Fouls (-1):</span> striker pocketed, no hit, wrong color first.</li>
              <li><span className="text-amber-300 font-bold">🎮 Controls:</span> Drag striker to position, pull to aim, release to shoot.</li>
            </ul>
          </div>
        </div>
      )}
    </main>
  );
}
