import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Coins } from "lucide-react";
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

export default function ArenaMatch() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const diff = (params.get("diff") as Diff) || "medium";
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
      // Drag right → camera pans right → player yaw decreases (world rotates left)
      ctrlRef.current.lookDX -= e.movementX * sens;
      // Drag down → look down → pitch decreases (negative pitch = looking down in our convention)
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

      // Build self input
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
      const fire = c.fire || (mouseLockedRef.current && !!k["Mouse0"]); // mouse handled via flag
      const ads = c.ads || !!k["Mouse2"]; // also via flag
      adsRef.current = ads;

      // apply look deltas
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
        });
      }
      decayWeapon(self, dt, now);

      // Bot
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

      // Damage feedback for self
      if (st.lastDamage && st.lastDamage.victimId === self.id && st.lastDamage.at > (lastDamageDirRef.current?.at ?? 0)) {
        const fromX = st.lastDamage.from.x - self.pos.x;
        const fromZ = st.lastDamage.from.z - self.pos.z;
        const angleWorld = Math.atan2(fromX, fromZ);
        const rel = angleWorld - self.yaw;
        lastDamageDirRef.current = { angle: rel, at: st.lastDamage.at };
      }

      tickRespawns(st, now);
      pruneFx(st, now);

      // Time-up win condition
      if (now >= st.endsAt && !st.finished) {
        st.finished = true;
        st.winnerId = self.kills === opp.kills ? null : (self.kills > opp.kills ? self.id : opp.id);
      }

      if (st.finished && !payoutClaimedRef.current) {
        payoutClaimedRef.current = true;
        const won = st.winnerId === self.id;
        const reward = won ? 50 : 0;
        if (won && profile) {
          // grant coins via direct profile update (same pattern as other games)
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

      force(x => (x + 1) & 0xffff);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [diff, profile, refreshProfile]);

  const requestPointerLock = () => {
    // Unlock audio on first user gesture
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

      {/* Top-left exit (above minimap controls don't conflict on mobile) */}
      <button
        onClick={(e) => { e.stopPropagation(); navigate("/hub"); }}
        className="absolute top-3 right-3 z-30 sm:hidden bg-black/55 backdrop-blur border border-white/15 rounded-full p-2"
        aria-label="Exit"
      >
        <ArrowLeft className="h-4 w-4 text-white" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); navigate("/hub"); }}
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
              <button
                onClick={() => { window.location.reload(); }}
                className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold"
              >Rematch</button>
              <button
                onClick={() => navigate("/hub")}
                className="flex-1 h-11 rounded-xl bg-muted text-foreground font-bold"
              >Hub</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
