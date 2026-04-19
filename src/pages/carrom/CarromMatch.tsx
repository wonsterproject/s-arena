import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, Crown, Disc } from "lucide-react";
import CarromScene, { type CarromSceneApi } from "@/components/carrom/CarromScene";
import { createMatch, resolveShot } from "@/game/carrom/rules";
import { planBotShot, type Difficulty } from "@/game/carrom/bot";
import { BOARD, type PieceColor } from "@/game/carrom/constants";
import type { MatchState } from "@/game/carrom/types";
import GameTopBar from "@/components/game/GameTopBar";
import PlayerInfoCard from "@/components/game/PlayerInfoCard";

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

  useEffect(() => {
    if (!apiRef.current) return;
    const z = match.turn === 0 ? BOARD.baselineY : -BOARD.baselineY;
    apiRef.current.setStrikerPosition(0, z);
  }, [match.turn]);

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

  const titleText = match.winner !== null
    ? `${match.players[match.winner].name} wins!`
    : me.isBot ? "Opponent's Turn" : "Your Turn";
  const subtitle = match.winner !== null
    ? "Game Over"
    : shooting ? "Shot in progress..." : me.isBot ? "Thinking..." : "Aiming Shot...";

  return (
    <main className="min-h-screen px-2 py-2 sm:py-3 overflow-hidden">
      <div className="max-w-5xl mx-auto flex flex-col h-screen">
        <GameTopBar
          title={titleText}
          subtitle={subtitle}
          onBack={() => navigate("/carrom/lobby")}
          onRestart={restart}
        />

        {/* Player cards on top (compact row) */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <PlayerInfoCard
            name={match.players[0].name}
            isActive={match.turn === 0}
            isYou={!match.players[0].isBot}
            avatarLetter={match.players[0].name[0]?.toUpperCase()}
            badge={match.players[0].color ?? undefined}
            badgeColor={match.players[0].color === "white" ? "hsl(45 30% 70%)" : match.players[0].color === "black" ? "hsl(0 0% 18%)" : undefined}
            stats={[
              { icon: <Disc className="h-3 w-3 text-amber-400" fill="currentColor" />, value: match.players[0].score },
              { icon: <Crown className="h-3 w-3 text-red-400" />, value: match.players[0].queenCovered ? 1 : 0 },
            ]}
            align="left"
          />
          <PlayerInfoCard
            name={match.players[1].name}
            isActive={match.turn === 1}
            isYou={!match.players[1].isBot}
            avatarLetter={match.players[1].name[0]?.toUpperCase()}
            badge={match.players[1].color ?? undefined}
            badgeColor={match.players[1].color === "white" ? "hsl(45 30% 70%)" : match.players[1].color === "black" ? "hsl(0 0% 18%)" : undefined}
            stats={[
              { icon: <Disc className="h-3 w-3 text-amber-400" fill="currentColor" />, value: match.players[1].score },
              { icon: <Crown className="h-3 w-3 text-red-400" />, value: match.players[1].queenCovered ? 1 : 0 },
            ]}
            align="right"
          />
        </div>

        {/* Board fills remaining space, square, centered */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              width: "min(100%, calc(100vh - 200px))",
              height: "min(100%, calc(100vh - 200px))",
              aspectRatio: "1 / 1",
              boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.4) inset, 0 6px 24px rgba(0,0,0,0.6)",
            }}
          >
            <CarromScene
              onReady={(api) => { apiRef.current = api; api.setStrikerPosition(0, BOARD.baselineY); }}
              onShotResolved={handleShotResolved}
              currentSide={match.turn}
              shooting={shooting}
              interactive={isHumanTurn}
              onShootRequest={handleShootRequest}
            />
          </div>
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
