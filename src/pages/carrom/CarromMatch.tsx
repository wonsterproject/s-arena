import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RotateCcw, Crown, Trophy } from "lucide-react";
import CarromScene, { type CarromSceneApi } from "@/components/carrom/CarromScene";
import { createMatch, resolveShot } from "@/game/carrom/rules";
import { planBotShot, type Difficulty } from "@/game/carrom/bot";
import { BOARD, type PieceColor } from "@/game/carrom/constants";
import type { MatchState } from "@/game/carrom/types";

export default function CarromMatch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "bot") as "bot" | "local";
  const diff = (params.get("diff") || "medium") as Difficulty;

  const apiRef = useRef<CarromSceneApi | null>(null);
  const [match, setMatch] = useState<MatchState>(() =>
    createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ),
  );
  const [strikerX, setStrikerX] = useState(0);
  const [angle, setAngle] = useState(match.turn === 0 ? -Math.PI / 2 : Math.PI / 2); // radians, 0 = +X
  const [power, setPower] = useState(0.7);
  const [shooting, setShooting] = useState(false);

  // Place striker on baseline whenever turn changes
  useEffect(() => {
    if (!apiRef.current) return;
    const z = match.turn === 0 ? BOARD.baselineY : -BOARD.baselineY;
    apiRef.current.setStrikerPosition(strikerX, z);
    // Default aim toward opposite side
    setAngle(match.turn === 0 ? -Math.PI / 2 : Math.PI / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.turn]);

  useEffect(() => {
    if (!apiRef.current) return;
    const z = match.turn === 0 ? BOARD.baselineY : -BOARD.baselineY;
    apiRef.current.setStrikerPosition(strikerX, z);
  }, [strikerX, match.turn]);

  const handleShoot = () => {
    if (shooting || match.winner !== null) return;
    if (!apiRef.current) return;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    setShooting(true);
    apiRef.current.shoot(dx, dz, power);
  };

  // Bot turn
  useEffect(() => {
    if (match.winner !== null) return;
    const me = match.players[match.turn];
    if (!me.isBot || shooting) return;
    const t = setTimeout(() => {
      if (!apiRef.current) return;
      // Build a snapshot of pieces with positions from physics — we cheat by reading via DOM-less ref;
      // simpler: ask scene for the live pieces via window access. Use a safe approach: bot picks a
      // generic shot using initial layout reasoning isn't great. Instead, do a straight power shot
      // if we can't access positions. We'll provide a small adapter.
      const piecesSnapshot = (apiRef.current as any)._piecesSnapshot?.() ?? [];
      const fallback = { strikerX: 0, strikerZ: me.side === 0 ? BOARD.baselineY : -BOARD.baselineY, dirX: 0, dirZ: me.side === 0 ? -1 : 1, power: 0.75 };
      const shot = piecesSnapshot.length
        ? planBotShot(match, piecesSnapshot, diff)
        : fallback;
      setStrikerX(shot.strikerX);
      apiRef.current.setStrikerPosition(shot.strikerX, shot.strikerZ);
      setAngle(Math.atan2(shot.dirZ, shot.dirX));
      setPower(shot.power);
      setShooting(true);
      setTimeout(() => apiRef.current!.shoot(shot.dirX, shot.dirZ, shot.power), 600);
    }, 900);
    return () => clearTimeout(t);
  }, [match.turn, match.winner, shooting, diff, match]);

  const handleShotResolved = (info: { piecesPocketed: string[]; strikerPocketed: boolean; hitAny: boolean; firstContact: PieceColor | "striker" | null }) => {
    setMatch(prev => {
      const next: MatchState = JSON.parse(JSON.stringify(prev));
      const pocketedColors: PieceColor[] = [];
      for (const id of info.piecesPocketed) {
        const p = next.pieces.find(pp => pp.id === id);
        if (p && !p.pocketed) {
          p.pocketed = true;
          pocketedColors.push(p.color);
        }
      }
      const queenWasPendingBefore = prev.queenPocketedPending;
      const queenOwnerBefore = prev.queenOwnerPending;

      const updated = resolveShot(next, {
        pocketedThisShot: pocketedColors,
        strikerPocketed: info.strikerPocketed,
        hitAny: info.hitAny,
        firstContactColor: info.firstContact,
      });

      // If queen was pending from this player and turn passed (cover failed), respawn queen mesh
      if (queenWasPendingBefore && queenOwnerBefore === prev.turn && !updated.queenPocketedPending) {
        const q = updated.pieces.find(p => p.color === "queen");
        if (q && q.pocketed) {
          q.pocketed = false;
          setTimeout(() => apiRef.current?.respawnQueen(), 50);
        }
      }
      return updated;
    });
    setShooting(false);
  };

  const restart = () => {
    setMatch(createMatch(
      mode === "bot" ? "You" : "Player 1",
      mode === "bot" ? `Bot (${diff})` : "Player 2",
      mode === "bot" ? 1 : null,
    ));
    setStrikerX(0);
    setPower(0.7);
    window.location.reload();
  };

  const me = match.players[match.turn];
  const isHumanTurn = !me.isBot && !shooting && match.winner === null;

  return (
    <main className="min-h-screen px-2 py-3">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <button onClick={() => navigate("/carrom/lobby")} className="glass-btn h-9 px-3 flex items-center gap-1 text-sm">
            <ArrowLeft className="h-4 w-4" /> Lobby
          </button>
          <div className="glass rounded-full px-4 py-1.5 text-sm font-bold text-center flex-1 min-w-[200px]">
            {match.message}
          </div>
          <button onClick={restart} className="glass-btn h-9 px-3 flex items-center gap-1 text-sm">
            <RotateCcw className="h-4 w-4" /> Restart
          </button>
        </div>

        {/* Players */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {match.players.map((p, i) => (
            <div key={i} className={`glass rounded-2xl p-3 ring-2 ${match.turn === i ? "ring-primary animate-pulse" : "ring-transparent"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{p.isBot ? "Bot" : "Player"} {i + 1}</div>
                  <div className="font-bold flex items-center gap-1">
                    {p.name}
                    {p.queenCovered && <Crown className="h-3 w-3 text-red-500" />}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black">{p.score}</div>
                  <div className="text-[10px] uppercase tracking-wider" style={{ color: p.color === "white" ? "#f5f1e6" : p.color === "black" ? "#94a3b8" : "#64748b" }}>
                    {p.color ?? "—"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 3D Scene */}
        <div className="aspect-square sm:aspect-[4/3] w-full glass rounded-2xl overflow-hidden ring-1 ring-white/10">
          <CarromScene
            onReady={(api) => { apiRef.current = api; api.setStrikerPosition(0, BOARD.baselineY); }}
            onShotResolved={handleShotResolved}
            currentSide={match.turn}
            shooting={shooting}
          />
        </div>

        {/* Controls */}
        <div className="glass rounded-2xl p-4 mt-3 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Striker position</span>
              <span className="font-mono">{strikerX.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={-BOARD.baselineHalfWidth}
              max={BOARD.baselineHalfWidth}
              step={0.05}
              value={strikerX}
              disabled={!isHumanTurn}
              onChange={(e) => setStrikerX(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Aim angle</span>
              <span className="font-mono">{((angle * 180) / Math.PI).toFixed(0)}°</span>
            </div>
            <input
              type="range"
              min={match.turn === 0 ? -Math.PI + 0.1 : 0.1}
              max={match.turn === 0 ? -0.1 : Math.PI - 0.1}
              step={0.01}
              value={angle}
              disabled={!isHumanTurn}
              onChange={(e) => setAngle(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Power</span>
              <span className="font-mono">{Math.round(power * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1} max={1} step={0.01}
              value={power}
              disabled={!isHumanTurn}
              onChange={(e) => setPower(Number(e.target.value))}
              className="w-full accent-yellow-400"
            />
          </div>
          <button
            onClick={handleShoot}
            disabled={!isHumanTurn}
            className="w-full glass-btn h-12 bg-gradient-to-r from-primary/40 to-accent/40 font-black text-lg disabled:opacity-50"
          >
            {shooting ? "Shooting..." : me.isBot ? "Bot's turn" : "🎯 SHOOT"}
          </button>
        </div>

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
