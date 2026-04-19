import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trophy, BookOpen, Volume2, VolumeX, X } from "lucide-react";
import CarromScene, { type CarromSceneApi } from "@/components/carrom/CarromScene";
import { createMatch, resolveShot } from "@/game/carrom/rules";
import { planBotShot, type Difficulty } from "@/game/carrom/bot";
import { BOARD, type PieceColor } from "@/game/carrom/constants";
import type { MatchState } from "@/game/carrom/types";
import GameTopBar from "@/components/game/GameTopBar";
import { useCarromSounds } from "@/game/carrom/useCarromSounds";

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
  const [soundOn, setSoundOn] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const playSound = useCarromSounds(soundOn);
  const collisionUnsubRef = useRef<(() => void) | null>(null);
  const lastCollideAt = useRef(0);

  useEffect(() => {
    if (!apiRef.current) return;
    const z = match.turn === 0 ? BOARD.baselineY : -BOARD.baselineY;
    apiRef.current.setStrikerPosition(0, z);
  }, [match.turn]);

  // Win sound (plays once when winner is decided)
  useEffect(() => {
    if (match.winner !== null) playSound("win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.winner]);

  // Cleanup collision subscription on unmount
  useEffect(() => () => { collisionUnsubRef.current?.(); }, []);

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
    playSound("strike");
    apiRef.current.shoot(dirX, dirZ, power);
  };

  const handleShotResolved = (info: { piecesPocketed: string[]; strikerPocketed: boolean; hitAny: boolean; firstContact: PieceColor | "striker" | null }) => {
    // SFX for outcome
    if (info.strikerPocketed) playSound("foul");
    else if (info.piecesPocketed.length > 0) playSound("pocket");

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

  const you = match.players[0];
  const opp = match.players[1];
  const colorsAssigned = !!you.color;

  const titleText = match.winner !== null
    ? `${match.players[match.winner].name} wins!`
    : me.isBot ? "Opponent's Turn" : "Your Turn";
  const subtitle = match.winner !== null
    ? "Game Over"
    : shooting
      ? (match.message || "Shot in progress...")
      : !colorsAssigned
        ? "Pocket any coin to claim your color"
        : me.isBot ? "Thinking..." : "Aiming Shot...";

  const ColorDot = ({ c }: { c: "white" | "black" | null }) => (
    <span
      className="inline-block h-3 w-3 rounded-full border border-white/30"
      style={{
        background: c === "white" ? "hsl(45 30% 85%)" : c === "black" ? "hsl(0 0% 15%)" : "hsl(0 0% 40%)",
        boxShadow: c ? "0 0 6px hsl(45 100% 60% / 0.5)" : undefined,
      }}
    />
  );

  return (
    <main className="min-h-screen px-2 py-2 sm:py-3 overflow-hidden">
      <div className="max-w-5xl mx-auto flex flex-col h-screen">
        <GameTopBar
          title={titleText}
          subtitle={subtitle}
          onBack={() => navigate("/carrom/lobby")}
          onRestart={restart}
        />

        {/* Compact status strip: scores + colors + sound/rules buttons */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-1 rounded-xl text-xs"
          style={{
            background: "linear-gradient(180deg, hsl(232 50% 14% / 0.9), hsl(232 55% 8% / 0.9))",
            boxShadow: "0 0 0 1px hsl(45 100% 60% / 0.25) inset",
          }}
        >
          <div className="flex items-center gap-1.5 font-bold text-white">
            <ColorDot c={you.color} />
            <span>You</span>
            <span className="text-amber-300">{you.score}</span>
            {you.queenCovered && <span className="text-red-400">♛</span>}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowRules(true)}
              aria-label="Show rules"
              className="h-7 w-7 grid place-items-center rounded-lg text-white/90 hover:text-white transition"
              style={{ background: "hsl(232 50% 22% / 0.7)", boxShadow: "0 0 0 1px hsl(45 100% 60% / 0.3) inset" }}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSoundOn(s => !s)}
              aria-label={soundOn ? "Mute" : "Unmute"}
              className="h-7 w-7 grid place-items-center rounded-lg text-white/90 hover:text-white transition"
              style={{ background: "hsl(232 50% 22% / 0.7)", boxShadow: "0 0 0 1px hsl(45 100% 60% / 0.3) inset" }}
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-1.5 font-bold text-white">
            {opp.queenCovered && <span className="text-red-400">♛</span>}
            <span className="text-amber-300">{opp.score}</span>
            <span>{opp.name}</span>
            <ColorDot c={opp.color} />
          </div>
        </div>

        {/* Board fills remaining space, square, centered */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              width: "min(100%, calc(100vh - 150px))",
              height: "min(100%, calc(100vh - 150px))",
              aspectRatio: "1 / 1",
              boxShadow: "0 0 0 2px hsl(45 100% 60% / 0.4) inset, 0 6px 24px rgba(0,0,0,0.6)",
            }}
          >
            <CarromScene
              onReady={(api) => {
                apiRef.current = api;
                api.setStrikerPosition(0, BOARD.baselineY);
                collisionUnsubRef.current?.();
                collisionUnsubRef.current = api.onCollision(({ speed }) => {
                  // Throttle collision SFX so we don't spam during multi-bounces
                  const now = performance.now();
                  if (now - lastCollideAt.current < 55) return;
                  lastCollideAt.current = now;
                  if (speed > 0.5) playSound("collide");
                });
              }}
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
