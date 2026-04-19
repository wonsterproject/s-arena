import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Coins, Circle, CircleDot } from "lucide-react";
import PoolScene, { type PoolSceneApi } from "@/components/pool/PoolScene";
import { createMatch, resolveShot } from "@/game/pool/rules";
import { applyShot } from "@/game/pool/physics";
import { planBotShot, type Difficulty } from "@/game/pool/bot";
import type { Ball, MatchState, ShotResult } from "@/game/pool/types";
import { TABLE, BALL, POCKETS, PHYS } from "@/game/pool/constants";
import GameTopBar from "@/components/game/GameTopBar";
import PlayerInfoCard from "@/components/game/PlayerInfoCard";
import VerticalPowerStrip from "@/components/game/VerticalPowerStrip";
import LandscapeGate from "@/components/pool/LandscapeGate";

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
  const diff = (params.get("diff") || "medium") as Difficulty;

  const [match, setMatch] = useState<MatchState>(() => createMatch("You", `Bot (${diff})`, 1));
  const [animBalls, setAnimBalls] = useState<Ball[]>(() => match.balls.map(b => ({ ...b })));
  const [shooting, setShooting] = useState(false);
  const [botHint, setBotHint] = useState<{ dx: number; dz: number } | null>(null);
  const [power, setPower] = useState(0);
  const [hasAim, setHasAim] = useState(false);
  const animRef = useRef<number | null>(null);
  const sceneRef = useRef<PoolSceneApi | null>(null);

  // Compute table size that fits inside available viewport (landscape).
  const [tableSize, setTableSize] = useState({ w: 800, h: 400 });
  useEffect(() => {
    const recalc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isMobile = Math.min(vw, vh) < 600;
      // On mobile (landscape) we shrink reserves so the table dominates the screen.
      const horizReserve = isMobile ? 52 : 80;   // power strip + small gap
      const vertReserve  = isMobile ? 120 : 200; // topbar + bottom HUD
      const availW = vw - horizReserve;
      const availH = vh - vertReserve;
      // Table aspect 2:1
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

  useEffect(() => {
    if (!shooting) setAnimBalls(match.balls.map(b => ({ ...b })));
  }, [match.balls, shooting]);

  useEffect(() => { if (shooting) setPower(0); }, [shooting]);

  const me = match.players[match.turn];
  const isHumanTurn = !me.isBot && !shooting && match.winner === null;

  function runShot(dirX: number, dirZ: number, shotPower: number) {
    if (shooting || match.winner !== null) return;
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
          return resolveShot(next, result);
        });
        setShooting(false);
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }

  // Bot turn
  useEffect(() => {
    if (match.winner !== null) return;
    if (!me.isBot || shooting) return;
    const t = setTimeout(() => {
      const shot = planBotShot(match, diff);
      setBotHint({ dx: shot.dirX, dz: shot.dirZ });
      setTimeout(() => runShot(shot.dirX, shot.dirZ, shot.power), 700);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.turn, match.winner, shooting]);

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
    setMatch(createMatch("You", `Bot (${diff})`, 1));
    setPower(0);
  };

  const groupCounts = useMemo(() => {
    return match.players.map(p => {
      if (!p.group) return { remaining: 7, label: "", color: "hsl(232 50% 30%)" };
      const remaining = 7 - p.pottedCount;
      return {
        remaining,
        label: p.group === "solid" ? "Solids" : "Stripes",
        color: p.group === "solid" ? "hsl(215 95% 45%)" : "hsl(28 95% 50%)",
      };
    });
  }, [match]);

  const titleText = match.winner !== null
    ? `${match.players[match.winner].name} wins!`
    : me.isBot ? "Opponent's Turn" : "Your Turn";

  const meCount = groupCounts[match.turn];
  const infoText = match.winner !== null
    ? "Game Over"
    : shooting
      ? "Shot in progress..."
      : match.ballInHand
        ? "Place Cue Ball"
        : meCount.label
          ? `${meCount.remaining} left • ${meCount.label}`
          : me.isBot ? "Thinking..." : "Drag to aim, slide power to shoot";

  const fireShot = () => sceneRef.current?.shoot();

  return (
    <main className="min-h-screen px-2 py-2 sm:py-3 overflow-hidden">
      <LandscapeGate />
      <div className="max-w-[1400px] mx-auto">
        <GameTopBar
          title={titleText}
          infoText={infoText}
          infoColor={meCount.label ? `${meCount.color} / 0.65` : undefined}
          onBack={() => navigate("/pool/lobby")}
          onRestart={restart}
        />

        {/* Table + vertical power strip side-by-side */}
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
          {/* Vertical power strip, height matches table */}
          <div style={{ height: tableSize.h }} className="flex items-stretch">
            <VerticalPowerStrip
              power={power}
              setPower={setPower}
              onRelease={fireShot}
              disabled={!isHumanTurn || !hasAim}
            />
          </div>
        </div>

        {match.ballInHand && isHumanTurn && (
          <div className="mt-2 rounded-xl px-3 py-1.5 text-center text-xs font-bold text-amber-300 mx-auto max-w-md"
               style={{ background: "hsl(232 50% 12% / 0.85)", boxShadow: "0 0 0 1.5px hsl(45 100% 60% / 0.4) inset" }}>
            🖐️ Tap on the table to place the cue ball, then aim.
          </div>
        )}

        {/* Bottom HUD: just two compact player cards side by side */}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
          <PlayerInfoCard
            name={match.players[0].name}
            isActive={match.turn === 0}
            isYou={!match.players[0].isBot}
            avatarLetter={match.players[0].name[0]?.toUpperCase()}
            badge={groupCounts[0].label}
            badgeColor={groupCounts[0].color}
            stats={[
              { icon: <Coins className="h-3 w-3 text-amber-400" />, value: 0 },
              { icon: <Circle className="h-3 w-3 text-orange-400" fill="currentColor" />, value: groupCounts[0].remaining },
            ]}
            align="left"
          />
          <PlayerInfoCard
            name={match.players[1].name}
            isActive={match.turn === 1}
            isYou={!match.players[1].isBot}
            avatarLetter={match.players[1].name[0]?.toUpperCase()}
            badge={groupCounts[1].label}
            badgeColor={groupCounts[1].color}
            stats={[
              { icon: <Coins className="h-3 w-3 text-amber-400" />, value: 0 },
              { icon: <CircleDot className="h-3 w-3 text-orange-400" />, value: groupCounts[1].remaining },
            ]}
            align="right"
          />
        </div>

        {match.winner !== null && (
          <div
            className="rounded-2xl p-6 mt-3 text-center"
            style={{
              background: "linear-gradient(180deg, hsl(232 50% 16%), hsl(232 55% 9%))",
              boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 0 22px hsl(45 100% 60% / 0.3)",
            }}
          >
            <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
            <h2 className="text-2xl font-black mb-1 text-white">{match.players[match.winner].name} wins!</h2>
            <button
              onClick={restart}
              className="mt-3 h-11 px-7 rounded-2xl font-black text-white"
              style={{
                background: "linear-gradient(180deg, hsl(28 100% 60%), hsl(20 100% 45%))",
                boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 4px 12px rgba(0,0,0,0.5)",
              }}
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
