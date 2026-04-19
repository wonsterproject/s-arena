import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import PoolScene from "@/components/pool/PoolScene";
import { createMatch, resolveShot } from "@/game/pool/rules";
import { applyShot } from "@/game/pool/physics";
import { planBotShot, type Difficulty } from "@/game/pool/bot";
import type { MatchState } from "@/game/pool/types";
import { TABLE, BALL, POCKETS } from "@/game/pool/constants";

export default function PoolMatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const diff = (params.get("diff") || "medium") as Difficulty;

  const [match, setMatch] = useState<MatchState>(() => createMatch("You", `Bot (${diff})`, 1));
  const [animBalls, setAnimBalls] = useState(() => match.balls);
  const [shooting, setShooting] = useState(false);
  const [botHint, setBotHint] = useState<{ dx: number; dz: number } | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shooting) setAnimBalls(match.balls.map(b => ({ ...b })));
  }, [match.balls, shooting]);

  const me = match.players[match.turn];
  const isHumanTurn = !me.isBot && !shooting && match.winner === null;

  function runShot(dirX: number, dirZ: number, power: number) {
    if (shooting || match.winner !== null) return;
    setShooting(true);
    setBotHint(null);

    const working = match.balls.map(b => ({ ...b }));
    const cue = working.find(b => b.id === 0)!;
    applyShot(cue, dirX, dirZ, power);

    const frames: typeof working[] = [];
    const subStepsPerFrame = 2;
    let safety = 0;
    const allBalls = working;
    const playMinX = -TABLE.halfW + TABLE.cushionInset + BALL.radius;
    const playMaxX =  TABLE.halfW - TABLE.cushionInset - BALL.radius;
    const playMinZ = -TABLE.halfH + TABLE.cushionInset + BALL.radius;
    const playMaxZ =  TABLE.halfH - TABLE.cushionInset - BALL.radius;
    const dt = 1 / 120;
    const friction = 0.985;
    const cushionRestitution = 0.78;
    const restitution = 0.92;
    const restThreshold = 0.02;
    
    let pocketedIds: number[] = [];
    let firstContactId: number | null = null;
    let cushionAfterContact = false;
    let hitAny = false;

    while (safety < 10000) {
      safety++;
      for (let s = 0; s < subStepsPerFrame; s++) {
        let anyMoving = false;
        for (const b of allBalls) {
          if (b.pocketed) continue;
          if (Math.hypot(b.vx, b.vz) > restThreshold) anyMoving = true;
          b.x += b.vx * dt;
          b.z += b.vz * dt;
          const decay = Math.pow(friction, dt * 60);
          b.vx *= decay; b.vz *= decay;
          if (Math.hypot(b.vx, b.vz) < restThreshold) { b.vx = 0; b.vz = 0; }
        }
        for (const b of allBalls) {
          if (b.pocketed) continue;
          let bounced = false;
          if (b.x < playMinX) { b.x = playMinX; b.vx = -b.vx * cushionRestitution; bounced = true; }
          else if (b.x > playMaxX) { b.x = playMaxX; b.vx = -b.vx * cushionRestitution; bounced = true; }
          if (b.z < playMinZ) { b.z = playMinZ; b.vz = -b.vz * cushionRestitution; bounced = true; }
          else if (b.z > playMaxZ) { b.z = playMaxZ; b.vz = -b.vz * cushionRestitution; bounced = true; }
          if (bounced && firstContactId !== null) cushionAfterContact = true;
        }
        for (let i = 0; i < allBalls.length; i++) {
          const a = allBalls[i]; if (a.pocketed) continue;
          for (let j = i + 1; j < allBalls.length; j++) {
            const c = allBalls[j]; if (c.pocketed) continue;
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
              a.vx *= 0.5 + 0.5 * restitution; a.vz *= 0.5 + 0.5 * restitution;
              c.vx *= 0.5 + 0.5 * restitution; c.vz *= 0.5 + 0.5 * restitution;
              if (a.id === 0 && firstContactId === null && c.id !== 0) { firstContactId = c.id; hitAny = true; }
              else if (c.id === 0 && firstContactId === null && a.id !== 0) { firstContactId = a.id; hitAny = true; }
              else if (firstContactId !== null) hitAny = true;
            }
          }
        }
        for (const b of allBalls) {
          if (b.pocketed) continue;
          for (const p of POCKETS) {
            const d = Math.hypot(b.x - p.x, b.z - p.z);
            if (d < p.r) {
              b.pocketed = true; b.vx = 0; b.vz = 0;
              b.x = p.x; b.z = p.z;
              pocketedIds.push(b.id);
              if (firstContactId !== null) cushionAfterContact = true;
              break;
            }
          }
        }
        if (!anyMoving && s === subStepsPerFrame - 1) {
          frames.push(allBalls.map(b => ({ ...b })));
          safety = 99999;
          break;
        }
      }
      frames.push(allBalls.map(b => ({ ...b })));
      if (safety >= 99999) break;
    }

    let frameIdx = 0;
    const tick = () => {
      if (frameIdx >= frames.length) {
        const result = {
          pocketedIds,
          cuePocketed: pocketedIds.includes(0),
          firstContactId,
          cushionAfterContact,
          hitAny,
        };
        setMatch(prev => {
          const next: MatchState = JSON.parse(JSON.stringify(prev));
          next.balls = frames[frames.length - 1].map(b => ({ ...b }));
          return resolveShot(next, result);
        });
        setShooting(false);
        return;
      }
      setAnimBalls(frames[frameIdx]);
      frameIdx += 2;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    if (match.winner !== null) return;
    if (!me.isBot || shooting) return;
    const t = setTimeout(() => {
      const shot = planBotShot(match, diff);
      setBotHint({ dx: shot.dirX, dz: shot.dirZ });
      setTimeout(() => runShot(shot.dirX, shot.dirZ, shot.power), 800);
    }, 700);
    return () => clearTimeout(t);
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
  };

  const groupCounts = useMemo(() => {
    return match.players.map(p => {
      if (!p.group) return { remaining: 7, label: "Open" };
      const remaining = 7 - p.pottedCount;
      return { remaining, label: p.group === "solid" ? "Solids 1-7" : "Stripes 9-15" };
    });
  }, [match]);

  return (
    <main className="min-h-screen px-2 py-3">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <button onClick={() => navigate("/pool/lobby")} className="glass-btn h-9 px-3 flex items-center gap-1 text-sm">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </button>
          <div className="glass rounded-full px-4 py-1.5 text-sm font-bold text-center flex-1 min-w-[200px]">
            {match.message}
          </div>
          <button onClick={restart} className="glass-btn h-9 px-3 flex items-center gap-1 text-sm">
            <RotateCcw className="h-4 w-4" /> Restart
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {match.players.map((p, i) => (
            <div key={i} className={`glass rounded-2xl p-3 ring-2 ${match.turn === i ? "ring-primary animate-pulse" : "ring-transparent"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{p.isBot ? "Bot" : "Player"}</div>
                  <div className="font-bold">{p.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{groupCounts[i].label}</div>
                  <div className="text-lg font-black">{groupCounts[i].remaining} left</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <PoolScene
          balls={animBalls}
          interactive={isHumanTurn}
          ballInHand={match.ballInHand}
          onShoot={runShot}
          onPlaceCue={handlePlaceCue}
          ghostHint={botHint}
        />

        {match.ballInHand && isHumanTurn && (
          <div className="glass rounded-2xl p-3 mt-3 text-center text-sm font-bold text-amber-400">
            🖐️ Ball in hand — tap anywhere on the table to place the cue ball, then aim & shoot.
          </div>
        )}

        {match.winner !== null && (
          <div className="glass rounded-2xl p-6 mt-3 text-center">
            <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-2" />
            <h2 className="text-2xl font-black mb-1">{match.players[match.winner].name} wins!</h2>
            <button onClick={restart} className="glass-btn mt-3 h-10 px-6 bg-primary/30 font-bold">Play again</button>
          </div>
        )}
      </div>
    </main>
  );
}
