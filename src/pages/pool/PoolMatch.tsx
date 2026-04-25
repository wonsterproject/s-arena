import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Wifi, Coins, Loader2 } from "lucide-react";
import PoolScene, { type PoolSceneApi } from "@/components/pool/PoolScene";
import { createMatch, resolveShot } from "@/game/pool/rules";
import { applyShot } from "@/game/pool/physics";
import { planBotShot, type Difficulty } from "@/game/pool/bot";
import type { Ball, MatchState, ShotResult } from "@/game/pool/types";
import { TABLE, BALL, POCKETS, PHYS } from "@/game/pool/constants";
import GameTopBar from "@/components/game/GameTopBar";
import VerticalPowerStrip from "@/components/game/VerticalPowerStrip";
import LandscapeGate from "@/components/pool/LandscapeGate";
import PreMatchVS from "@/components/match/PreMatchVS";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { finalizePaidBotMatch } from "@/game/finalizePaidBotMatch";
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

function physicsStep(
  balls: Ball[],
  ctx: { firstContactId: number | null; cushionAfterContact: boolean; hitAny: boolean; pocketed: number[] },
) {
  const playMinX = -TABLE.halfW + TABLE.cushionInset + BALL.radius;
  const playMaxX =  TABLE.halfW - TABLE.cushionInset - BALL.radius;
  const playMinZ = -TABLE.halfH + TABLE.cushionInset + BALL.radius;
  const playMaxZ =  TABLE.halfH - TABLE.cushionInset - BALL.radius;
  const dt = PHYS.dt;
  let anyMoving = false;
  for (const b of balls) {
    if (b.pocketed) continue;
    if (Math.hypot(b.vx, b.vz) > PHYS.restThreshold) anyMoving = true;
    b.x += b.vx * dt; b.z += b.vz * dt;
    const decay = Math.pow(PHYS.friction, dt * 60);
    b.vx *= decay; b.vz *= decay;
    if (Math.hypot(b.vx, b.vz) < PHYS.restThreshold) { b.vx = 0; b.vz = 0; }
  }
  for (const b of balls) {
    if (b.pocketed) continue;
    let bounced = false;
    if (b.x < playMinX) { b.x = playMinX; b.vx = -b.vx * PHYS.cushionRestitution; bounced = true; }
    else if (b.x > playMaxX) { b.x = playMaxX; b.vx = -b.vx * PHYS.cushionRestitution; bounced = true; }
    if (b.z < playMinZ) { b.z = playMinZ; b.vz = -b.vz * PHYS.cushionRestitution; bounced = true; }
    else if (b.z > playMaxZ) { b.z = playMaxZ; b.vz = -b.vz * PHYS.cushionRestitution; bounced = true; }
    if (bounced && ctx.firstContactId !== null) ctx.cushionAfterContact = true;
  }
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]; if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const c = balls[j]; if (c.pocketed) continue;
      const dx = c.x - a.x, dz = c.z - a.z;
      const dist = Math.hypot(dx, dz);
      const minDist = BALL.radius * 2;
      if (dist > 0 && dist < minDist) {
        const overlap = minDist - dist;
        const nx = dx / dist, nz = dz / dist;
        a.x -= nx * overlap / 2; a.z -= nz * overlap / 2;
        c.x += nx * overlap / 2; c.z += nz * overlap / 2;
        const va = a.vx * nx + a.vz * nz;
        const vc = c.vx * nx + c.vz * nz;
        a.vx += nx * (vc - va); a.vz += nz * (vc - va);
        c.vx -= nx * (vc - va); c.vz -= nz * (vc - va);
        a.vx *= 0.5 + 0.5 * PHYS.restitution; a.vz *= 0.5 + 0.5 * PHYS.restitution;
        c.vx *= 0.5 + 0.5 * PHYS.restitution; c.vz *= 0.5 + 0.5 * PHYS.restitution;
        if (a.id === 0 && ctx.firstContactId === null && c.id !== 0) { ctx.firstContactId = c.id; ctx.hitAny = true; }
        else if (c.id === 0 && ctx.firstContactId === null && a.id !== 0) { ctx.firstContactId = a.id; ctx.hitAny = true; }
        else if (ctx.firstContactId !== null) ctx.hitAny = true;
      }
    }
  }
  for (const b of balls) {
    if (b.pocketed) continue;
    for (const p of POCKETS) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < p.r) {
        b.pocketed = true; b.vx = 0; b.vz = 0;
        b.x = p.x; b.z = p.z;
        ctx.pocketed.push(b.id);
        if (ctx.firstContactId !== null) ctx.cushionAfterContact = true;
        break;
      }
    }
  }
  return anyMoving;
}

export default function PoolMatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "bot") as Mode;
  const initialDiff = (params.get("diff") || "medium") as Difficulty;
  const [diff, setDiff] = useState<Difficulty>(initialDiff);
  const onlineMatchId = params.get("id");
  const { user, profile, refreshProfile } = useAuth();

  const [match, setMatch] = useState<MatchState>(() => createMatch("You", `Bot (${diff})`, 1));
  const [botDisplayName, setBotDisplayName] = useState<string>(`Bot (${diff})`);
  const [animBalls, setAnimBalls] = useState<Ball[]>(() => match.balls.map(b => ({ ...b })));
  const [shooting, setShooting] = useState(false);
  const [botHint, setBotHint] = useState<{ dx: number; dz: number } | null>(null);
  const [power, setPower] = useState(0);
  const [hasAim, setHasAim] = useState(false);
  const animRef = useRef<number | null>(null);
  const sceneRef = useRef<PoolSceneApi | null>(null);

  const [online, setOnline] = useState<OnlineMeta | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(mode === "online");
  const finalizingRef = useRef(false);

  // Auto-win if opponent disconnects for 15s+ (refresh-tolerant)
  useMatchPresence({
    matchId: online?.matchId ?? null,
    userId: user?.id ?? null,
    opponentId: online?.opponentId ?? null,
    active: mode === "online" && online?.status === "active",
    onWin: () => refreshProfile(),
  });
  const skipNextPushRef = useRef(false);
  const channelRef = useRef<any>(null);
  const lastBroadcastAt = useRef(0);
  const lastRemoteAtRef = useRef(0);

  // Pre-match VS animation control: shown once per match when status flips to active.
  const [showVS, setShowVS] = useState(false);
  const vsShownRef = useRef(false);

  // Paid bot match support: lock-in bet so winner gets 2x via finalize_match
  const [paidBotBet, setPaidBotBet] = useState<number>(0);
  const [isFakeUserMatch, setIsFakeUserMatch] = useState(false);
  const paidBotFinalizedRef = useRef(false);

  const [tableSize, setTableSize] = useState({ w: 800, h: 400 });
  useEffect(() => {
    const recalc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = Math.min(vw, vh) < 600;
      const horizReserve = isMobile ? 52 : 80;
      const vertReserve  = isMobile ? 120 : 200;
      const availW = vw - horizReserve;
      const availH = vh - vertReserve;
      let w = Math.min(availW, availH * 2);
      let h = w / 2;
      if (h > availH) { h = availH; w = h * 2; }
      const minW = isMobile ? 520 : 360;
      const maxW = isMobile ? 1100 : 1200;
      w = Math.max(minW, Math.min(w, maxW));
      h = w / 2;
      setTableSize({ w, h });
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
    };
  }, []);

  // ===== ONLINE init + subscribe =====
  useEffect(() => {
    if (mode !== "online" || !onlineMatchId || !user) return;
    let cancelled = false;
    const init = async () => {
      const { data: m, error } = await supabase
        .from("matches").select("id, host_id, status, bet_amount, state")
        .eq("id", onlineMatchId).maybeSingle();
      if (cancelled) return;
      if (error || !m) { toast({ title: "Match not found", variant: "destructive" }); navigate("/pool/lobby"); return; }
      const { data: players } = await supabase.from("match_players")
        .select("user_id").eq("match_id", onlineMatchId);
      const me = (players ?? []).find(p => p.user_id === user.id);
      const opp = (players ?? []).find(p => p.user_id !== user.id);
      if (!me) { toast({ title: "Not part of this match", variant: "destructive" }); navigate("/pool/lobby"); return; }
      const mySide: 0 | 1 = m.host_id === user.id ? 0 : 1;
      let oppName = "Opponent";
      if (opp?.user_id) {
        const { data: oppP } = await supabase.from("profiles")
          .select("username, display_name").eq("id", opp.user_id).maybeSingle();
        oppName = oppP?.display_name || oppP?.username || "Opponent";
      }
      const start = createMatch(mySide === 0 ? "You" : oppName, mySide === 0 ? oppName : "You", null);
      const initial = (m.state && (m.state as any).balls) ? (m.state as any) : start;
      setMatch(initial);
      setAnimBalls(initial.balls.map((b: Ball) => ({ ...b })));
      setOnline({ matchId: m.id, mySide, opponentName: oppName, opponentId: opp?.user_id ?? null,
        betAmount: m.bet_amount ?? 0, status: m.status as any });
      setLoadingOnline(false);
    };
    void init();

    const ch = supabase.channel(`pool-match-${onlineMatchId}`, { config: { broadcast: { self: false } } })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${onlineMatchId}` },
        (payload) => {
          const newRow: any = payload.new;
          const updatedAtMs = newRow.updated_at ? new Date(newRow.updated_at).getTime() : 0;
          if (newRow.state && newRow.state.balls && updatedAtMs > lastRemoteAtRef.current) {
            lastRemoteAtRef.current = updatedAtMs;
            skipNextPushRef.current = true;
            const ns = newRow.state as MatchState;
            setMatch(ns);
            setAnimBalls(ns.balls.map(b => ({ ...b })));
          }
          if (newRow.status) {
            setOnline(p => {
              if (!p) return p;
              // Trigger VS animation when match flips to active for the first time.
              if (p.status !== "active" && newRow.status === "active" && !vsShownRef.current) {
                vsShownRef.current = true;
                setShowVS(true);
              }
              return { ...p, status: newRow.status as OnlineMeta["status"] };
            });
          }
        })
      // Realtime broadcast: intermediate-frame ball positions during opponent's shot.
      .on("broadcast", { event: "frame" }, ({ payload }) => {
        if (!payload || !Array.isArray(payload.balls)) return;
        const at = typeof payload.at === "number" ? payload.at : Date.now();
        if (at <= lastRemoteAtRef.current) return;
        lastRemoteAtRef.current = at;
        setAnimBalls(payload.balls as Ball[]);
      })
      .subscribe();
    channelRef.current = ch;
    return () => { cancelled = true; supabase.removeChannel(ch); channelRef.current = null; };
  }, [mode, onlineMatchId, user, navigate]);

  // Show VS once after initial load if status was already active and we haven't shown it yet.
  useEffect(() => {
    if (mode !== "online" || !online) return;
    if (online.status === "active" && !vsShownRef.current) {
      vsShownRef.current = true;
      setShowVS(true);
    }
  }, [mode, online]);

  const pushState = useCallback(async (next: MatchState) => {
    if (mode !== "online" || !onlineMatchId) return;
    await supabase.from("matches")
      .update({ state: next as any, updated_at: new Date().toISOString() })
      .eq("id", onlineMatchId);
  }, [mode, onlineMatchId]);

  // Paid bot match: load bet amount from match record
  useEffect(() => {
    if (mode !== "bot" || !onlineMatchId || !user) return;
    if (onlineMatchId.startsWith("local-")) return;
    void (async () => {
      const { data: m } = await supabase.from("matches")
        .select("bet_amount, host_id, status, state").eq("id", onlineMatchId).maybeSingle();
      if (m && m.host_id === user.id && m.status !== "finished") {
        setPaidBotBet(m.bet_amount ?? 0);
        // Use fake opponent's display name as bot name when challenged from Hub
        const fake = (m.state as any)?.fake_opponent;
        if (fake?.display_name) {
          setDiff("hard"); // Fake-user matches always face top-tier bot.
          setBotDisplayName(fake.display_name);
          setIsFakeUserMatch(true);
          setMatch(prev => {
            const next: MatchState = JSON.parse(JSON.stringify(prev));
            next.players[1].name = fake.display_name;
            return next;
          });
        }
      }
    })();
  }, [mode, onlineMatchId, user]);

  // Finalize paid bot match when it ends
  const finalizePaidBot = useCallback(async (humanWon: boolean) => {
    if (paidBotFinalizedRef.current) return;
    if (mode !== "bot" || !onlineMatchId || !user || paidBotBet <= 0) return;
    if (onlineMatchId.startsWith("local-")) return;
    paidBotFinalizedRef.current = true;
    const { error } = await finalizePaidBotMatch({
      matchId: onlineMatchId,
      humanUserId: user.id,
      humanWon,
      isFakeUserMatch,
    });
    if (!error) await refreshProfile();
  }, [mode, onlineMatchId, user, paidBotBet, refreshProfile, isFakeUserMatch]);

  useEffect(() => {
    if (!shooting) setAnimBalls(match.balls.map(b => ({ ...b })));
  }, [match.balls, shooting]);

  useEffect(() => { if (shooting) setPower(0); }, [shooting]);

  const me = match.players[match.turn];
  const isMyTurn = mode === "online" && online ? match.turn === online.mySide : !me.isBot;
  const isHumanTurn = isMyTurn && !shooting && match.winner === null;

  function runShot(dirX: number, dirZ: number, shotPower: number) {
    if (shooting || match.winner !== null) return;
    if (mode === "online" && online && match.turn !== online.mySide) {
      toast({ title: "Opponent's turn" });
      return;
    }
    setShooting(true);
    setBotHint(null);

    const working: Ball[] = match.balls.map(b => ({ ...b }));
    const cue = working.find(b => b.id === 0)!;
    if (cue.pocketed) { setShooting(false); return; }
    applyShot(cue, dirX, dirZ, shotPower);

    const ctx = { firstContactId: null as number | null, cushionAfterContact: false, hitAny: false, pocketed: [] as number[] };
    const subStepsPerFrame = 3;
    const maxFrames = Math.ceil(PHYS.maxSimSeconds * 60);
    let frameCount = 0;

    const tick = () => {
      let stillMoving = false;
      for (let s = 0; s < subStepsPerFrame; s++) {
        const moving = physicsStep(working, ctx);
        if (moving) stillMoving = true;
      }
      setAnimBalls(working.map(b => ({ ...b })));
      frameCount++;
      if (stillMoving && frameCount < maxFrames) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        const result: ShotResult = {
          pocketedIds: ctx.pocketed,
          cuePocketed: ctx.pocketed.includes(0),
          firstContactId: ctx.firstContactId,
          cushionAfterContact: ctx.cushionAfterContact,
          hitAny: ctx.hitAny,
        };
        setMatch(prev => {
          const next: MatchState = JSON.parse(JSON.stringify(prev));
          next.balls = working.map(b => ({ ...b }));
          const resolved = resolveShot(next, result);
          // Online push & finalize
          if (mode === "online" && online) {
            void pushState(resolved);
            if (resolved.winner !== null && online.status !== "finished" && !finalizingRef.current) {
              finalizingRef.current = true;
              const winnerUserId = resolved.winner === online.mySide ? user!.id : online.opponentId;
              if (winnerUserId) {
                supabase.rpc("finalize_match", { _match_id: online.matchId, _winner_id: winnerUserId })
                  .then(() => refreshProfile());
              }
            }
          }
          // Paid bot match finalize (human is always side 0)
          if (mode === "bot" && resolved.winner !== null && paidBotBet > 0) {
            void finalizePaidBot(resolved.winner === 0);
          }
          return resolved;
        });
        setShooting(false);
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }

  // Bot turn (bot mode only)
  useEffect(() => {
    if (mode !== "bot" || match.winner !== null) return;
    if (!me.isBot || shooting) return;
    const t = setTimeout(() => {
      const shot = planBotShot(match, diff);
      setBotHint({ dx: shot.dirX, dz: shot.dirZ });
      setTimeout(() => runShot(shot.dirX, shot.dirZ, shot.power), 700);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, match.turn, match.winner, shooting]);

  useEffect(() => () => { if (animRef.current) cancelAnimationFrame(animRef.current); }, []);

  const handlePlaceCue = (x: number, z: number) => {
    if (!match.ballInHand || shooting) return;
    setMatch(prev => {
      const next = { ...prev, balls: prev.balls.map(b => ({ ...b })) };
      const cue = next.balls.find(b => b.id === 0);
      if (!cue) return prev;
      const minX = -TABLE.halfW + TABLE.cushionInset + BALL.radius;
      const maxX =  TABLE.halfW - TABLE.cushionInset - BALL.radius;
      const minZ = -TABLE.halfH + TABLE.cushionInset + BALL.radius;
      const maxZ =  TABLE.halfH - TABLE.cushionInset - BALL.radius;
      cue.x = Math.max(minX, Math.min(maxX, x));
      cue.z = Math.max(minZ, Math.min(maxZ, z));
      return next;
    });
  };

  const restart = () => {
    if (mode === "online") return;
    setMatch(createMatch("You", `Bot (${diff})`, 1));
    setPower(0);
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
      if (!error) { toast({ title: "You resigned" }); await refreshProfile(); }
    }
  };

  const groupCounts = useMemo(() => {
    return match.players.map(p => {
      if (!p.group) return { remaining: 7, label: "", color: "hsl(232 50% 30%)", colorAlpha: "hsl(232 50% 30% / 0.5)" };
      const remaining = 7 - p.pottedCount;
      return {
        remaining,
        label: p.group === "solid" ? "Solids" : "Stripes",
        color: p.group === "solid" ? "hsl(215 95% 45%)" : "hsl(28 95% 50%)",
        colorAlpha: p.group === "solid" ? "hsl(215 95% 55% / 0.65)" : "hsl(28 95% 55% / 0.7)",
      };
    });
  }, [match]);

  const myDisplayName = profile?.display_name || profile?.username || "You";
  const opponentDisplayName = mode === "online" && online
    ? online.opponentName
    : (mode === "bot" ? botDisplayName : match.players[1].name);
  const turnHolderName = isMyTurn ? myDisplayName : opponentDisplayName;
  const titleText = match.winner !== null
    ? `${match.players[match.winner].name} wins!`
    : `${turnHolderName}'s Turn`;

  const meCount = groupCounts[match.turn];
  const infoText = match.winner !== null ? "Game Over"
    : shooting ? "Shot in progress..."
    : match.ballInHand ? "Place Cue Ball"
    : meCount.label ? `${meCount.remaining} left • ${meCount.label}`
    : isMyTurn ? "Drag to aim, slide power to shoot" : (mode === "bot" ? "Thinking..." : "Waiting...");

  const fireShot = () => sceneRef.current?.shoot();

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
      <LandscapeGate />
      <div className="max-w-[1400px] mx-auto">
        <GameTopBar
          title={titleText}
          infoText={infoText}
          infoColor={meCount.label ? meCount.colorAlpha : undefined}
          onBack={() => navigate("/pool/lobby")}
          onRestart={mode === "online" ? resign : restart}
        />

        {mode === "online" && online && (
          <div className="flex items-center justify-center gap-2 px-3 py-1 mt-1 rounded-xl text-xs bg-primary/10 border border-primary/30">
            <Wifi className="h-3 w-3 text-green-400" />
            <span className="font-bold">@{myDisplayName} vs @{online.opponentName}</span>
            {online.betAmount > 0 && (
              <span className="flex items-center gap-1 text-yellow-400 font-bold">
                <Coins className="h-3 w-3" /> Pot {online.betAmount * 2}
              </span>
            )}
            {online.status === "waiting" && <span className="text-yellow-300 animate-pulse">Waiting…</span>}
          </div>
        )}

        {mode === "bot" && paidBotBet > 0 && (
          <div className="flex items-center justify-center gap-2 px-3 py-1 mt-1 rounded-xl text-xs bg-yellow-500/10 border border-yellow-500/30">
            <Coins className="h-3 w-3 text-yellow-400" />
            <span className="font-bold text-yellow-300">Bet: {paidBotBet}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-bold text-yellow-400">Win 2× = {paidBotBet * 2}</span>
          </div>
        )}

        <div className="mt-1 flex items-center justify-center gap-2 sm:gap-3">
          <PoolScene
            ref={sceneRef}
            balls={animBalls}
            interactive={isHumanTurn}
            ballInHand={match.ballInHand}
            power={power}
            onShoot={runShot}
            onPlaceCue={handlePlaceCue}
            onAimChange={setHasAim}
            ghostHint={botHint}
            fixedWidth={tableSize.w}
            fixedHeight={tableSize.h}
          />
          <div style={{ height: tableSize.h }} className="flex items-stretch">
            <VerticalPowerStrip power={power} setPower={setPower} onRelease={fireShot} disabled={!isHumanTurn || !hasAim} />
          </div>
        </div>

        {match.ballInHand && isHumanTurn && (
          <div className="mt-2 rounded-xl px-3 py-1.5 text-center text-xs font-bold text-amber-300 mx-auto max-w-md"
               style={{ background: "hsl(232 50% 12% / 0.85)", boxShadow: "0 0 0 1.5px hsl(45 100% 60% / 0.4) inset" }}>
            🖐️ Tap on the table to place the cue ball, then aim.
          </div>
        )}

        {match.winner !== null && (
          <div className="rounded-2xl p-6 mt-3 text-center"
            style={{ background: "linear-gradient(180deg, hsl(232 50% 16%), hsl(232 55% 9%))",
                     boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 0 22px hsl(45 100% 60% / 0.3)" }}>
            <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
            <h2 className="text-2xl font-black mb-1 text-white">{match.players[match.winner].name} wins!</h2>
            {mode === "online" && online && online.betAmount > 0 && (
              <p className="text-sm text-amber-300 mb-2">Pot: {online.betAmount * 2} coins</p>
            )}
            {mode === "bot" && paidBotBet > 0 && (
              <p className="text-sm text-amber-300 mb-2">
                {match.winner === 0 ? `🎉 You won ${paidBotBet * 2} coins!` : `Lost ${paidBotBet} coins`}
              </p>
            )}
            <button onClick={(mode === "online" || (mode === "bot" && paidBotBet > 0)) ? () => navigate("/pool/lobby") : restart}
              className="mt-3 h-11 px-7 rounded-2xl font-black text-white"
              style={{ background: "linear-gradient(180deg, hsl(28 100% 60%), hsl(20 100% 45%))",
                       boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 4px 12px rgba(0,0,0,0.5)" }}>
              {(mode === "online" || (mode === "bot" && paidBotBet > 0)) ? "Back to Lobby" : "Play Again"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
