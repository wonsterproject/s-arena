import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Volume2, VolumeX, Wifi, Coins, Loader2 } from "lucide-react";
import StringCarromScene, { type SCSceneApi } from "@/components/stringCarrom/StringCarromScene";
import { createMatch, resolveShot } from "@/game/stringCarrom/rules";
import { applySlingShot, simulate } from "@/game/stringCarrom/physics";
import { planSlingShot, type Difficulty } from "@/game/stringCarrom/bot";
import { SLING } from "@/game/stringCarrom/constants";
import type { MatchState } from "@/game/stringCarrom/types";
import { useStringCarromSounds } from "@/game/stringCarrom/sounds";
import GameTopBar from "@/components/game/GameTopBar";
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

export default function StringCarromMatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "bot") as Mode;
  const diff = (params.get("diff") || "medium") as Difficulty;
  const onlineMatchId = params.get("id");
  const { user, refreshProfile } = useAuth();

  const apiRef = useRef<SCSceneApi | null>(null);
  const [match, setMatch] = useState<MatchState>(() =>
    createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ),
  );
  const [shooting, setShooting] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const playSound = useStringCarromSounds(soundOn);

  const [online, setOnline] = useState<OnlineMeta | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(mode === "online");
  const finalizingRef = useRef(false);
  const skipNextPushRef = useRef(false);
  const [paidBotBet, setPaidBotBet] = useState<number>(0);
  const paidBotFinalizedRef = useRef(false);
  const [ghost, setGhost] = useState<React.ComponentProps<typeof StringCarromScene>["ghost"]>(null);

  // ===== ONLINE: load + subscribe =====
  useEffect(() => {
    if (mode !== "online" || !onlineMatchId || !user) return;
    let cancelled = false;
    const init = async () => {
      const { data: m, error } = await supabase
        .from("matches").select("id, host_id, status, bet_amount, state")
        .eq("id", onlineMatchId).maybeSingle();
      if (cancelled) return;
      if (error || !m) { toast({ title: "Match not found", variant: "destructive" }); navigate("/string-carrom/lobby"); return; }
      const { data: players } = await supabase
        .from("match_players").select("user_id, color").eq("match_id", onlineMatchId);
      const me = (players ?? []).find(p => p.user_id === user.id);
      const opp = (players ?? []).find(p => p.user_id !== user.id);
      if (!me) { toast({ title: "Not part of this match", variant: "destructive" }); navigate("/string-carrom/lobby"); return; }
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
      setMatch((m.state && (m.state as any).pucks) ? (m.state as any) : startMatch);
      setOnline({ matchId: m.id, mySide, opponentName: oppName, opponentId: opp?.user_id ?? null,
        betAmount: m.bet_amount ?? 0, status: m.status as any });
      setLoadingOnline(false);
    };
    void init();

    const ch = supabase.channel(`scarrom-match-${onlineMatchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${onlineMatchId}` },
        (payload) => {
          const newRow: any = payload.new;
          if (newRow.state && newRow.state.pucks) {
            skipNextPushRef.current = true;
            setMatch(newRow.state as MatchState);
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
    if (match.winner !== null) playSound("win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.winner]);

  // Shooting helper: applies impulse, simulates to rest, resolves rules.
  const performShot = useCallback((puckId: number, dirX: number, dirY: number, power: number) => {
    setShooting(true);
    playSound("twang", 0.6 + power * 0.6);
    setMatch(prev => {
      const next: MatchState = JSON.parse(JSON.stringify(prev));
      const puck = next.pucks.find(p => p.id === puckId);
      if (!puck) { setShooting(false); return prev; }
      applySlingShot(puck, dirX, dirY, power);
      const result = simulate(next.pucks);
      next.discs = next.pucks;
      const updated = resolveShot(next, result);
      // Online sync
      if (mode === "online" && online && !skipNextPushRef.current) {
        void pushState(updated);
        if (updated.winner !== null && online.status !== "finished" && !finalizingRef.current) {
          finalizingRef.current = true;
          const winnerUserId = updated.winner === online.mySide ? user!.id : online.opponentId;
          if (winnerUserId) {
            supabase.rpc("finalize_match", { _match_id: online.matchId, _winner_id: winnerUserId })
              .then(() => refreshProfile());
          }
        }
      }
      if (mode === "bot" && updated.winner !== null && paidBotBet > 0) {
        void finalizePaidBot(updated.winner === 0);
      }
      skipNextPushRef.current = false;
      // Sound feedback
      if (result.pucksCrossedGap > 0) playSound("thock");
      else if (!result.hitAny) playSound("foul");
      else playSound("tok");
      return updated;
    });
    // Allow short cooldown so UI can react.
    setTimeout(() => setShooting(false), 350);
  }, [mode, online, user, paidBotBet, pushState, finalizePaidBot, refreshProfile, playSound]);

  // Bot turn (bot mode only) — telegraph ghost then shoot.
  useEffect(() => {
    if (mode !== "bot" || match.winner !== null) return;
    const me = match.players[match.turn];
    if (!me.isBot || shooting) return;
    let cancelled = false;
    const t1 = setTimeout(() => {
      if (cancelled) return;
      const shot = planSlingShot(match, diff);
      if (!shot) return;
      const puck = match.pucks.find(p => p.id === shot.puckId);
      if (!puck) return;
      // Animate ghost: pull back from anchor along -dir over 700ms, then fire.
      const anchorY = match.turn === 0 ? SLING.anchorYA : SLING.anchorYB;
      const anchorX = puck.x;
      const pull = SLING.maxPull * shot.power;
      const start = performance.now();
      const dur = 700;
      const tick = () => {
        if (cancelled) return;
        const t = Math.min(1, (performance.now() - start) / dur);
        const px = anchorX + (-shot.dirX) * pull * t;
        const py = anchorY + (-shot.dirY) * pull * t;
        setGhost({
          puckId: shot.puckId,
          posX: px, posY: py,
          side: match.turn,
          anchorX, anchorY,
          dirX: shot.dirX, dirY: shot.dirY,
          power: shot.power * t,
        });
        if (t < 1) requestAnimationFrame(tick);
        else {
          setTimeout(() => {
            if (cancelled) return;
            setGhost(null);
            performShot(shot.puckId, shot.dirX, shot.dirY, shot.power);
          }, 200);
        }
      };
      requestAnimationFrame(tick);
    }, 700);
    return () => { cancelled = true; clearTimeout(t1); setGhost(null); };
  }, [mode, match.turn, match.winner, shooting, diff, match, performShot]);

  const handleSling = (puckId: number, _px: number, _py: number, dirX: number, dirY: number, power: number) => {
    if (shooting || match.winner !== null) return;
    if (mode === "online" && online && match.turn !== online.mySide) {
      toast({ title: "Opponent's turn" });
      return;
    }
    performShot(puckId, dirX, dirY, power);
  };

  const restart = () => {
    if (mode === "online") return;
    setMatch(createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ));
    apiRef.current?.reset();
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
  const mySide: 0 | 1 = mode === "online" && online ? online.mySide : (mode === "bot" ? 0 : match.turn);
  const isMyTurn = mode === "online" && online ? match.turn === online.mySide : !me.isBot;
  const isHumanTurn = isMyTurn && !shooting && match.winner === null;

  const titleText = match.winner !== null
    ? `${match.players[match.winner].name} wins!`
    : isMyTurn ? "Your Turn" : "Opponent's Turn";
  const subtitle = match.winner !== null
    ? "Game Over"
    : shooting ? "Shot in progress..."
    : isMyTurn ? "Pull a puck back to sling" : (mode === "bot" ? "Thinking..." : "Waiting...");

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
      <div className="max-w-3xl mx-auto flex flex-col h-screen">
        <GameTopBar
          title={titleText}
          subtitle={subtitle}
          onBack={() => navigate("/string-carrom/lobby")}
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

        {mode === "bot" && paidBotBet > 0 && (
          <div className="flex items-center justify-center gap-2 px-3 py-1 mb-1 rounded-xl text-xs bg-yellow-500/10 border border-yellow-500/30">
            <Coins className="h-3 w-3 text-yellow-400" />
            <span className="font-bold text-yellow-300">Bet pot: {paidBotBet * 2} coins</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1 rounded-xl text-xs bg-card border border-border">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="inline-block h-3 w-3 rounded-full bg-white border border-border" />
            <span>{match.players[0].name}</span>
          </div>
          <button onClick={() => setSoundOn(s => !s)} className="glass-btn h-7 w-7 grid place-items-center">
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <div className="flex items-center gap-1.5 font-bold">
            <span>{match.players[1].name}</span>
            <span className="inline-block h-3 w-3 rounded-full bg-slate-900 border border-border" />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center min-h-0">
          <StringCarromScene
            ref={apiRef}
            pucks={match.pucks}
            turn={match.turn}
            mySide={mySide}
            interactive={isHumanTurn}
            onSling={handleSling}
            ghost={ghost}
          />
        </div>

        {match.winner !== null && (
          <div className="rounded-2xl p-6 mt-3 text-center bg-card border border-yellow-500/40">
            <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
            <h2 className="text-2xl font-black mb-1">{match.players[match.winner].name} wins!</h2>
            {mode === "online" && online && online.betAmount > 0 && (
              <p className="text-sm text-amber-300 mb-2">Pot: {online.betAmount * 2} coins</p>
            )}
            {mode === "bot" && paidBotBet > 0 && (
              <p className="text-sm text-amber-300 mb-2">
                {match.winner === 0 ? `+${paidBotBet * 2} coins!` : `Lost ${paidBotBet} coins`}
              </p>
            )}
            <button onClick={mode === "online" ? () => navigate("/string-carrom/lobby") : restart}
              className="mt-3 h-11 px-7 rounded-2xl font-black bg-gradient-to-r from-primary to-accent">
              {mode === "online" ? "Back to Lobby" : "Play Again"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
