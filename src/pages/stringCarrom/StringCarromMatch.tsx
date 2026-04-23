import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Volume2, VolumeX, Wifi, Coins, Loader2 } from "lucide-react";
import StringCarromScene, { type SCSceneApi } from "@/components/stringCarrom/StringCarromScene";
import { createMatch, checkWinner, ownPucksOnOwnHalf } from "@/game/stringCarrom/rules";
import { applySlingShot, step } from "@/game/stringCarrom/physics";
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
  // matchRef mirrors `match` so the rAF physics loop can read latest state without re-subscribing.
  const matchRef = useRef(match);
  matchRef.current = match;

  const [soundOn, setSoundOn] = useState(true);
  const playSound = useStringCarromSounds(soundOn);

  const [online, setOnline] = useState<OnlineMeta | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(mode === "online");
  const finalizingRef = useRef(false);
  const [paidBotBet, setPaidBotBet] = useState<number>(0);
  const paidBotFinalizedRef = useRef(false);
  const [ghost, setGhost] = useState<React.ComponentProps<typeof StringCarromScene>["ghost"]>(null);

  // Countdown 3..2..1..GO before play starts.
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    if (countdown <= 0) { setStarted(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, started]);

  // ===== Continuous physics loop (visible animation) =====
  // Runs at ~60fps. Each frame, advances physics one step on the live puck array
  // and triggers a re-render so the UI sees pucks slide and bounce in real time.
  useEffect(() => {
    if (!started) return;
    if (match.winner !== null) return;
    let raf = 0;
    let lastSoundT = 0;
    const tick = () => {
      const m = matchRef.current;
      // Snapshot speeds before stepping (to detect collision impacts for sound).
      const before = m.pucks.map(p => Math.hypot(p.vx, p.vy));
      const moving = step(m.pucks);
      // Detect a sharp speed change → collision sound throttle.
      let bigImpact = false;
      for (let i = 0; i < m.pucks.length; i++) {
        const after = Math.hypot(m.pucks[i].vx, m.pucks[i].vy);
        if (Math.abs(after - before[i]) > 2.5) { bigImpact = true; break; }
      }
      const now = performance.now();
      if (bigImpact && now - lastSoundT > 80) {
        playSound("tok");
        lastSoundT = now;
      }
      // Force a re-render so the canvas redraws with new puck positions.
      // We mutate-and-assign to keep the same reference but a new top-level object.
      setMatch(prev => ({ ...prev, pucks: prev.pucks }));

      // Win check.
      const w = checkWinner(m);
      if (w !== null) {
        setMatch(prev => ({ ...prev, winner: w, message: `${prev.players[w].name} wins!` }));
        return;
      }
      raf = requestAnimationFrame(tick);
      // Suppress unused warning — `moving` is just informational; we always keep ticking.
      void moving;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, match.winner, playSound]);

  // ===== Bot loop — fires shots on a cooldown while it still has pucks on its half =====
  useEffect(() => {
    if (mode !== "bot" || !started || match.winner !== null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cooldownMap: Record<Difficulty, [number, number]> = {
      easy: [1800, 2600],
      medium: [1200, 1900],
      hard: [800, 1300],
    };

    const fireOne = () => {
      if (cancelled) return;
      const m = matchRef.current;
      if (m.winner !== null) return;
      // Only sling if the bot still has own pucks on its own half.
      const remaining = ownPucksOnOwnHalf(m, 1);
      if (remaining.length === 0) return;
      const shot = planSlingShot(m, diff, 1);
      if (!shot) { schedule(); return; }

      // Telegraph ghost: pull back ~600ms then fire.
      const puck = m.pucks.find(p => p.id === shot.puckId);
      if (!puck) { schedule(); return; }
      const anchorY = SLING.anchorYB;
      const anchorX = puck.x;
      const pull = SLING.maxPull * shot.power;
      const start = performance.now();
      const dur = 500;
      const animateGhost = () => {
        if (cancelled) return;
        const t = Math.min(1, (performance.now() - start) / dur);
        setGhost({
          puckId: shot.puckId,
          posX: anchorX + (-shot.dirX) * pull * t,
          posY: anchorY + (-shot.dirY) * pull * t,
          side: 1,
          anchorX, anchorY,
          dirX: shot.dirX, dirY: shot.dirY,
          power: shot.power * t,
        });
        if (t < 1) requestAnimationFrame(animateGhost);
        else {
          setTimeout(() => {
            if (cancelled) return;
            setGhost(null);
            const live = matchRef.current.pucks.find(p => p.id === shot.puckId);
            if (live) {
              applySlingShot(live, shot.dirX, shot.dirY, shot.power);
              playSound("twang", 0.6 + shot.power * 0.6);
            }
            schedule();
          }, 120);
        }
      };
      requestAnimationFrame(animateGhost);
    };

    const schedule = () => {
      if (cancelled) return;
      const [lo, hi] = cooldownMap[diff];
      const delay = lo + Math.random() * (hi - lo);
      timer = setTimeout(fireOne, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setGhost(null);
    };
  }, [mode, diff, started, match.winner, playSound]);

  // ===== Online: load + subscribe (kept simple — turn-less online uses last-write-wins state push) =====
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
    return () => { cancelled = true; };
  }, [mode, onlineMatchId, user, navigate]);

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

  // On winner: play sound + finalize paid bot.
  useEffect(() => {
    if (match.winner === null) return;
    playSound("win");
    if (mode === "bot" && paidBotBet > 0) {
      void finalizePaidBot(match.winner === 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.winner]);

  // Human sling — applies impulse directly to the live puck. Physics loop animates it.
  const handleSling = (puckId: number, _px: number, _py: number, dirX: number, dirY: number, power: number) => {
    if (!started || match.winner !== null) return;
    const live = matchRef.current.pucks.find(p => p.id === puckId);
    if (!live) return;
    applySlingShot(live, dirX, dirY, power);
    playSound("twang", 0.6 + power * 0.6);
  };

  const restart = () => {
    if (mode === "online") return;
    paidBotFinalizedRef.current = false;
    setMatch(createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ));
    setCountdown(3);
    setStarted(false);
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

  const mySide: 0 | 1 = mode === "online" && online ? online.mySide : 0;
  const myRemaining = ownPucksOnOwnHalf(match, mySide).length;
  const oppSide: 0 | 1 = mySide === 0 ? 1 : 0;
  const oppRemaining = ownPucksOnOwnHalf(match, oppSide).length;

  const titleText = match.winner !== null
    ? (match.winner === mySide ? "You Win!" : `${match.players[match.winner].name} wins!`)
    : !started ? "Get Ready!"
    : "Sling them across!";
  const subtitle = match.winner !== null
    ? "Game Over"
    : !started ? `Starting in ${countdown}…`
    : `Yours: ${myRemaining} • Opponent: ${oppRemaining}`;

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
            <span className="text-muted-foreground">({ownPucksOnOwnHalf(match, 0).length} left)</span>
          </div>
          <button onClick={() => setSoundOn(s => !s)} className="glass-btn h-7 w-7 grid place-items-center">
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </button>
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-muted-foreground">({ownPucksOnOwnHalf(match, 1).length} left)</span>
            <span>{match.players[1].name}</span>
            <span className="inline-block h-3 w-3 rounded-full bg-slate-900 border border-border" />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center min-h-0 relative">
          <StringCarromScene
            ref={apiRef}
            pucks={match.pucks}
            turn={0}
            mySide={mySide}
            interactive={started && match.winner === null}
            onSling={handleSling}
            ghost={ghost}
          />
          {!started && match.winner === null && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-full h-32 w-32 grid place-items-center bg-black/60 border-4 border-primary backdrop-blur-sm">
                <span className="text-7xl font-black text-primary animate-pulse">
                  {countdown > 0 ? countdown : "GO!"}
                </span>
              </div>
            </div>
          )}
        </div>

        {match.winner !== null && (
          <div className="rounded-2xl p-6 mt-3 text-center bg-card border border-yellow-500/40">
            <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
            <h2 className="text-2xl font-black mb-1">
              {match.winner === mySide ? "You win!" : `${match.players[match.winner].name} wins!`}
            </h2>
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
