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
  const [shooting, setShooting] = useState(false);

  // Reset striker on baseline whenever turn changes
  useEffect(() => {
    if (!apiRef.current) return;
    const z = match.turn === 0 ? BOARD.baselineY : -BOARD.baselineY;
    apiRef.current.setStrikerPosition(0, z);
  }, [match.turn]);

  // Bot turn
  useEffect(() => {
    if (match.winner !== null) return;
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
  }, [match.turn, match.winner, shooting, diff, match]);

  const handleShootRequest = (dirX: number, dirZ: number, power: number, sx: number, sz: number) => {
    if (shooting || match.winner !== null) return;
    if (!apiRef.current) return;
    apiRef.current.setStrikerPosition(sx, sz);
    setShooting(true);
    apiRef.current.shoot(dirX, dirZ, power);
  };

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
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
            interactive={isHumanTurn}
            onShootRequest={handleShootRequest}
          />
        </div>

        {/* Instructions */}
        <div className="glass rounded-2xl p-4 mt-3 text-center text-sm">
          {isHumanTurn ? (
            <div className="space-y-1">
              <div className="font-bold text-primary">🎯 Drag the striker to aim and shoot</div>
              <div className="text-xs text-muted-foreground">
                Touch & hold striker → slide left/right to position → pull back in any direction → release to shoot. Pull farther = more power.
              </div>
            </div>
          ) : (
            <div className="font-bold text-muted-foreground">
              {shooting ? "Shot in progress..." : me.isBot ? `${me.name} is thinking...` : "Waiting..."}
            </div>
          )}
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
