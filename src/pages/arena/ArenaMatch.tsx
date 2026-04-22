import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Coins, Wifi, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArenaScene } from "@/components/arena/ArenaScene";
import { ArenaHUD } from "@/components/arena/ArenaHUD";
import { TouchControls, type TouchControlState } from "@/components/arena/TouchControls";
import {
  applyReloadInput, decayWeapon, fireWeapon, makeMatch, pruneFx,
  stepEntityMovement, tickRespawns, type ArenaState,
} from "@/game/arena/engine";
import { botStep, type Diff } from "@/game/arena/bot";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

type Mode = "bot" | "online";

interface OnlineMeta {
  matchId: string;
  mySide: 0 | 1;
  opponentName: string;
  opponentId: string | null;
  betAmount: number;
  status: "waiting" | "active" | "finished" | "cancelled";
}

export default function ArenaMatch() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "bot") as Mode;
  const diff = (params.get("diff") as Diff) || "medium";
  const onlineMatchId = params.get("id");
  const isMobile = useIsMobile();

  const [, force] = useState(0);
  const stateRef = useRef<ArenaState>(makeMatch(profile?.username ?? "You", `BOT-${diff.toUpperCase()}`));
  const adsRef = useRef(false);
  const ctrlRef = useRef<TouchControlState>({
    moveX: 0, moveZ: 0, lookDX: 0, lookDY: 0, fire: false, ads: false, jump: false, reload: false, sprint: false, crouch: false,
  });
  const keysRef = useRef<Record<string, boolean>>({});
  const mouseLockedRef = useRef(false);
  const hitMarkerRef = useRef(0);
  const lastDamageDirRef = useRef<{ angle: number; at: number } | null>(null);
  const [endResult, setEndResult] = useState<{ won: boolean; coins: number } | null>(null);
  const payoutClaimedRef = useRef(false);

  const [online, setOnline] = useState<OnlineMeta | null>(null);
  const [loadingOnline, setLoadingOnline] = useState(mode === "online");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastBroadcastRef = useRef(0);
  const finalizingRef = useRef(false);
  const [paidBotBet, setPaidBotBet] = useState<number>(0);
  const paidBotFinalizedRef = useRef(false);

  // Load paid bot match bet
  useEffect(() => {
    if (mode !== "bot" || !onlineMatchId || !user) return;
    void (async () => {
      const { data: m } = await supabase.from("matches")
        .select("bet_amount, host_id, status").eq("id", onlineMatchId).maybeSingle();
      if (m && m.host_id === user.id && m.status !== "finished") setPaidBotBet(m.bet_amount ?? 0);
    })();
  }, [mode, onlineMatchId, user]);

  // ===== ONLINE init =====
  useEffect(() => {
    if (mode !== "online" || !onlineMatchId || !user) return;
    let cancelled = false;
    (async () => {
      const { data: m, error } = await supabase
        .from("matches").select("id, host_id, status, bet_amount")
        .eq("id", onlineMatchId).maybeSingle();
      if (cancelled) return;
      if (error || !m) { toast({ title: "Match not found", variant: "destructive" }); navigate("/arena/lobby"); return; }
      const { data: players } = await supabase.from("match_players")
        .select("user_id").eq("match_id", onlineMatchId);
      const me = (players ?? []).find(p => p.user_id === user.id);
      const opp = (players ?? []).find(p => p.user_id !== user.id);
      if (!me) { toast({ title: "Not part of this match", variant: "destructive" }); navigate("/arena/lobby"); return; }
      const mySide: 0 | 1 = m.host_id === user.id ? 0 : 1;
      let oppName = "Opponent";
      if (opp?.user_id) {
        const { data: oppP } = await supabase.from("profiles")
          .select("username, display_name").eq("id", opp.user_id).maybeSingle();
        oppName = oppP?.display_name || oppP?.username || "Opponent";
      }
      // rebuild match with proper names
      stateRef.current = makeMatch(profile?.username ?? "You", oppName);
      // mark opponent entity as not-bot so AI doesn't drive it
      stateRef.current.entities[1].isBot = false;
      setOnline({
        matchId: m.id, mySide, opponentName: oppName, opponentId: opp?.user_id ?? null,
        betAmount: m.bet_amount ?? 0, status: m.status as any,
      });
      setLoadingOnline(false);

      // Realtime broadcast channel
      const ch = supabase.channel(`arena-${onlineMatchId}`, { config: { broadcast: { self: false } } });
      channelRef.current = ch;
      ch.on("broadcast", { event: "state" }, ({ payload }) => {
        // Apply opponent state to entity[1] (from their POV they're entity[0], but we mirror to seat)
        const opp = stateRef.current.entities[1];
        if (!payload) return;
        opp.pos = payload.pos;
        opp.yaw = payload.yaw;
        opp.pitch = payload.pitch;
        opp.hp = payload.hp;
        opp.alive = payload.alive;
        opp.kills = payload.kills;
        opp.deaths = payload.deaths;
        opp.crouch = !!payload.crouch;
        opp.animPhase = payload.animPhase ?? 0;
        opp.fireFlashAt = payload.fireFlashAt ?? 0;
      });
      ch.on("broadcast", { event: "hit" }, ({ payload }) => {
        // Opponent claims they hit me
        const self = stateRef.current.entities[0];
        if (!self.alive) return;
        self.hp = Math.max(0, self.hp - (payload.dmg ?? 0));
        stateRef.current.lastDamage = { victimId: self.id, from: payload.from, at: performance.now() };
        if (self.hp <= 0) {
          self.alive = false; self.deaths += 1;
          self.respawnAt = performance.now() + 3000;
          stateRef.current.entities[1].kills += 1;
          if (stateRef.current.entities[1].kills >= 10) {
            stateRef.current.finished = true;
            stateRef.current.winnerId = stateRef.current.entities[1].id;
          }
        }
      });
      ch.subscribe();
    })();
    return () => {
      cancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [mode, onlineMatchId, user, profile, navigate]);

  // Desktop input
  useEffect(() => {
    const onKD = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "KeyR") ctrlRef.current.reload = true;
      if (e.code === "KeyC") ctrlRef.current.crouch = !ctrlRef.current.crouch;
    };
    const onKU = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    const onMM = (e: MouseEvent) => {
      if (!mouseLockedRef.current) return;
      const sens = 0.012;
      ctrlRef.current.lookDX -= e.movementX * sens;
      ctrlRef.current.lookDY -= e.movementY * sens;
    };
    const onMD = (e: MouseEvent) => {
      if (e.button === 0) ctrlRef.current.fire = true;
      if (e.button === 2) { ctrlRef.current.ads = true; e.preventDefault(); }
    };
    const onMU = (e: MouseEvent) => {
      if (e.button === 0) ctrlRef.current.fire = false;
      if (e.button === 2) ctrlRef.current.ads = false;
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => { mouseLockedRef.current = document.pointerLockElement != null; };
    window.addEventListener("keydown", onKD);
    window.addEventListener("keyup", onKU);
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mousedown", onMD);
    window.addEventListener("mouseup", onMU);
    window.addEventListener("contextmenu", onCtx);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.removeEventListener("keydown", onKD);
      window.removeEventListener("keyup", onKU);
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mousedown", onMD);
      window.removeEventListener("mouseup", onMU);
      window.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, []);

  // Game loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      if (st.finished) return;

      const self = st.entities[0];
      const opp = st.entities[1];

      const c = ctrlRef.current;
      const k = keysRef.current;
      let forward = c.moveZ;
      let right = c.moveX;
      if (k["KeyW"]) forward += 1;
      if (k["KeyS"]) forward -= 1;
      if (k["KeyD"]) right += 1;
      if (k["KeyA"]) right -= 1;
      const jump = c.jump || !!k["Space"];
      const sprint = c.sprint || !!k["ShiftLeft"] || !!k["ShiftRight"];
      const wantReload = c.reload || !!k["KeyR"];
      const fire = c.fire || (mouseLockedRef.current && !!k["Mouse0"]);
      const ads = c.ads || !!k["Mouse2"];
      adsRef.current = ads;

      const desiredYaw = self.yaw + c.lookDX;
      const desiredPitch = Math.max(-0.9, Math.min(0.9, self.pitch + c.lookDY));
      c.lookDX = 0; c.lookDY = 0;
      c.reload = false;
      c.jump = false;

      if (self.alive) {
        stepEntityMovement(self, { forward, right, jump, sprint, crouch: c.crouch, desiredYaw, desiredPitch }, dt);
        applyReloadInput(self, { fire, ads, reload: wantReload }, now);
        if (fire) fireWeapon(self, ads, st, now, (victim, dmg, head) => {
          if (head || dmg > 0) hitMarkerRef.current = now;
          // In online mode broadcast hit so opponent applies damage authoritatively
          if (mode === "online" && channelRef.current && victim.id === "p2") {
            channelRef.current.send({
              type: "broadcast", event: "hit",
              payload: { dmg, head, from: { x: self.pos.x, y: self.pos.y, z: self.pos.z } },
            });
          }
        });
      }
      decayWeapon(self, dt, now);

      // Opponent: bot mode → AI; online mode → driven by broadcast (no local sim)
      if (mode === "bot") {
        if (opp.alive) {
          const bi = botStep(opp, self, st.entities, diff, now);
          stepEntityMovement(opp, {
            forward: bi.moveZ, right: bi.moveX,
            jump: false, sprint: false,
            desiredYaw: bi.desiredYaw, desiredPitch: bi.desiredPitch,
          }, dt);
          applyReloadInput(opp, { fire: bi.fire, ads: false, reload: bi.reload }, now);
          if (bi.fire) fireWeapon(opp, false, st, now);
        }
        decayWeapon(opp, dt, now);
      }

      // Damage feedback
      if (st.lastDamage && st.lastDamage.victimId === self.id && st.lastDamage.at > (lastDamageDirRef.current?.at ?? 0)) {
        const fromX = st.lastDamage.from.x - self.pos.x;
        const fromZ = st.lastDamage.from.z - self.pos.z;
        const angleWorld = Math.atan2(fromX, fromZ);
        const rel = angleWorld - self.yaw;
        lastDamageDirRef.current = { angle: rel, at: st.lastDamage.at };
      }

      tickRespawns(st, now);
      pruneFx(st, now);

      // Time-up
      if (now >= st.endsAt && !st.finished) {
        st.finished = true;
        st.winnerId = self.kills === opp.kills ? null : (self.kills > opp.kills ? self.id : opp.id);
      }

      // Online state broadcast (15Hz)
      if (mode === "online" && channelRef.current && now - lastBroadcastRef.current > 66) {
        lastBroadcastRef.current = now;
        channelRef.current.send({
          type: "broadcast", event: "state",
          payload: {
            pos: self.pos, yaw: self.yaw, pitch: self.pitch,
            hp: self.hp, alive: self.alive,
            kills: self.kills, deaths: self.deaths,
            crouch: self.crouch, animPhase: self.animPhase, fireFlashAt: self.fireFlashAt,
          },
        });
      }

      // Finish + payout
      if (st.finished && !payoutClaimedRef.current) {
        payoutClaimedRef.current = true;
        const won = st.winnerId === self.id;
        if (mode === "online" && online && !finalizingRef.current) {
          finalizingRef.current = true;
          const winnerUserId = won ? user!.id : online.opponentId;
          if (winnerUserId) {
            supabase.rpc("finalize_match", { _match_id: online.matchId, _winner_id: winnerUserId })
              .then(() => refreshProfile());
          }
          setEndResult({ won, coins: won ? online.betAmount * 2 : 0 });
        } else if (mode === "bot" && paidBotBet > 0 && onlineMatchId && !paidBotFinalizedRef.current) {
          // Paid bot match: finalize via RPC (server awards 2x to human if won)
          paidBotFinalizedRef.current = true;
          (async () => {
            await supabase.rpc("finalize_match", {
              _match_id: onlineMatchId, _winner_id: won ? user!.id : null,
            });
            await refreshProfile();
          })();
          setEndResult({ won, coins: won ? paidBotBet * 2 : 0 });
        } else {
          const reward = won ? 50 : 0;
          if (won && profile) {
            (async () => {
              await supabase.from("profiles")
                .update({ coins: (profile.coins ?? 0) + reward, wins: (profile.wins ?? 0) + 1 })
                .eq("id", profile.id);
              await refreshProfile();
            })();
          } else if (profile) {
            (async () => {
              await supabase.from("profiles")
                .update({ losses: (profile.losses ?? 0) + 1 })
                .eq("id", profile.id);
              await refreshProfile();
            })();
          }
          setEndResult({ won, coins: reward });
        }
      }

      force(x => (x + 1) & 0xffff);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [diff, profile, refreshProfile, mode, online, user]);

  const requestPointerLock = () => {
    void import("@/game/arena/sounds").then(m => m.unlockAudio());
    const el = document.body;
    if (!isMobile && document.pointerLockElement !== el) el.requestPointerLock?.();
  };

  const damageDir = useMemo(() => {
    const d = lastDamageDirRef.current;
    if (!d) return null;
    if (performance.now() - d.at > 800) return null;
    return d.angle;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRef.current.entities[0].hp]);

  const self = stateRef.current.entities[0];

  if (mode === "online" && loadingOnline) {
    return (
      <main className="fixed inset-0 bg-[#0b1020] flex items-center justify-center">
        <div className="text-center text-white">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading match…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 bg-[#0b1020] overflow-hidden" onClick={requestPointerLock}>
      <ArenaScene state={stateRef.current} selfId="p1" ads={adsRef.current} />
      <ArenaHUD
        state={stateRef.current}
        selfId="p1"
        ads={adsRef.current}
        spread={self.spread + (adsRef.current ? 0.012 : 0.06)}
        hitMarkerAt={hitMarkerRef.current}
        damageDirAngle={damageDir}
      />

      {mode === "online" && online && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/60 backdrop-blur border border-primary/40 rounded-full px-3 h-8 flex items-center gap-2 text-xs text-white font-bold">
          <Wifi className="h-3 w-3 text-green-400" />
          @{online.opponentName}
          {online.betAmount > 0 && (
            <span className="flex items-center gap-1 text-yellow-400">
              <Coins className="h-3 w-3" /> {online.betAmount * 2}
            </span>
          )}
        </div>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); navigate("/arena/lobby"); }}
        className="absolute top-3 right-3 z-30 sm:hidden bg-black/55 backdrop-blur border border-white/15 rounded-full p-2"
        aria-label="Exit"
      >
        <ArrowLeft className="h-4 w-4 text-white" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); navigate("/arena/lobby"); }}
        className="hidden sm:flex absolute top-3 right-3 z-30 bg-black/55 backdrop-blur border border-white/15 rounded-full px-3 h-9 items-center gap-1.5 text-xs font-bold text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> EXIT
      </button>

      {isMobile && (
        <TouchControls state={ctrlRef} onConsume={() => {}} onReload={() => { ctrlRef.current.reload = true; }} />
      )}

      {!isMobile && !mouseLockedRef.current && !endResult && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-2xl font-black text-white mb-2">CLICK TO PLAY</div>
            <div className="text-sm text-white/70">WASD move · Mouse look · Click fire · Right-click ADS · R reload · Space jump · Shift sprint</div>
          </div>
        </div>
      )}

      {endResult && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="bg-card border border-border rounded-3xl p-8 text-center max-w-sm w-[90%] shadow-2xl">
            <div className={`text-4xl font-black mb-2 ${endResult.won ? "text-emerald-400" : "text-rose-400"}`}>
              {endResult.won ? "VICTORY" : "DEFEAT"}
            </div>
            <div className="text-sm text-muted-foreground mb-4">
              {self.kills} – {stateRef.current.entities[1].kills}
            </div>
            {endResult.coins > 0 && (
              <div className="flex items-center justify-center gap-2 text-yellow-400 font-bold mb-4">
                <Coins className="h-5 w-5" /> +{endResult.coins} coins
              </div>
            )}
            <div className="flex gap-2">
              {mode !== "online" && (
                <button
                  onClick={() => { window.location.reload(); }}
                  className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold"
                >Rematch</button>
              )}
              <button
                onClick={() => navigate(mode === "online" ? "/arena/lobby" : "/hub")}
                className="flex-1 h-11 rounded-xl bg-muted text-foreground font-bold"
              >Lobby</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
