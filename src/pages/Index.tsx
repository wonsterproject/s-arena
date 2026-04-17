import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Volume2, VolumeX, RotateCcw, Trophy } from "lucide-react";
import { Board } from "@/components/ludo/Board";
import { Dice } from "@/components/ludo/Dice";
import { PlayerPanel } from "@/components/ludo/PlayerPanel";
import {
  PLAYERS,
  PLAYER_HEX,
  PLAYER_LABEL,
  PlayerColor,
  Token,
  getTokenCell,
  isOnSafeTile,
  tileKey,
} from "@/game/ludoConstants";
import { useSounds } from "@/game/useSounds";

function makeInitialTokens(): Token[] {
  const tokens: Token[] = [];
  PLAYERS.forEach((p) => {
    for (let i = 0; i < 4; i++) {
      tokens.push({
        id: `${p}-${i}`,
        player: p,
        state: "base",
        progress: 0,
        baseSlot: i,
      });
    }
  });
  return tokens;
}

const Index = () => {
  const [tokens, setTokens] = useState<Token[]>(makeInitialTokens);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>("red");
  const [diceValue, setDiceValue] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [winner, setWinner] = useState<PlayerColor | null>(null);
  const [killedIds, setKilledIds] = useState<Set<string>>(new Set());
  const [animating, setAnimating] = useState(false);
  const consecutiveSixes = useRef(0);

  const play = useSounds(soundOn);

  const movableTokenIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hasRolled || rolling || animating || winner) return ids;
    tokens
      .filter((t) => t.player === currentPlayer)
      .forEach((t) => {
        if (t.state === "finished") return;
        if (t.state === "base") {
          if (diceValue === 6) ids.add(t.id);
        } else if (t.state === "active") {
          if (t.progress + diceValue <= 56) ids.add(t.id);
        }
      });
    return ids;
  }, [tokens, currentPlayer, diceValue, hasRolled, rolling, animating, winner]);

  const nextPlayer = useCallback((from: PlayerColor): PlayerColor => {
    const idx = PLAYERS.indexOf(from);
    return PLAYERS[(idx + 1) % PLAYERS.length];
  }, []);

  const endTurn = useCallback(
    (gotSix: boolean) => {
      setHasRolled(false);
      if (gotSix && consecutiveSixes.current < 3) {
        // same player rolls again
        return;
      }
      consecutiveSixes.current = 0;
      setCurrentPlayer((p) => nextPlayer(p));
    },
    [nextPlayer]
  );

  const rollDice = useCallback(() => {
    if (rolling || animating || winner || hasRolled) return;
    setRolling(true);
    play("dice");
    const finalValue = Math.floor(Math.random() * 6) + 1;
    window.setTimeout(() => {
      setDiceValue(finalValue);
      setRolling(false);
      setHasRolled(true);

      if (finalValue === 6) consecutiveSixes.current += 1;
      else consecutiveSixes.current = 0;

      // If no movable tokens, auto end turn
      window.setTimeout(() => {
        setTokens((curr) => {
          const playerTokens = curr.filter((t) => t.player === currentPlayer);
          const canMove = playerTokens.some((t) => {
            if (t.state === "finished") return false;
            if (t.state === "base") return finalValue === 6;
            return t.progress + finalValue <= 56;
          });
          if (!canMove) {
            window.setTimeout(() => endTurn(finalValue === 6), 500);
          }
          return curr;
        });
      }, 50);
    }, 700);
  }, [rolling, animating, winner, hasRolled, play, currentPlayer, endTurn]);

  const moveToken = useCallback(
    async (id: string) => {
      const token = tokens.find((t) => t.id === id);
      if (!token || !movableTokenIds.has(id)) return;
      setAnimating(true);

      let updated: Token[] = tokens.map((t) => ({ ...t }));
      const t = updated.find((x) => x.id === id)!;

      if (t.state === "base" && diceValue === 6) {
        t.state = "active";
        t.progress = 0;
        play("move");
        setTokens([...updated]);
        await new Promise((r) => setTimeout(r, 250));
      } else if (t.state === "active") {
        // step-by-step
        const steps = diceValue;
        for (let i = 0; i < steps; i++) {
          t.progress += 1;
          setTokens([...updated]);
          play("move");
          await new Promise((r) => setTimeout(r, 130));
        }
        if (t.progress === 56) {
          t.state = "finished";
        }
      }

      // Kill check
      let killed = false;
      if (t.state === "active" && !isOnSafeTile(t)) {
        const [r, c] = getTokenCell(t);
        const k = tileKey(r, c);
        const enemiesHere = updated.filter(
          (o) => o.id !== t.id && o.state === "active" && o.player !== t.player
        );
        const toKill: Token[] = [];
        enemiesHere.forEach((o) => {
          const [or, oc] = getTokenCell(o);
          if (tileKey(or, oc) === k && !isOnSafeTile(o)) toKill.push(o);
        });
        if (toKill.length > 0) {
          killed = true;
          play("kill");
          setKilledIds(new Set(toKill.map((x) => x.id)));
          await new Promise((r) => setTimeout(r, 480));
          toKill.forEach((o) => {
            o.state = "base";
            o.progress = 0;
          });
          setTokens([...updated]);
          setKilledIds(new Set());
        }
      }

      // Check win
      const playerTokens = updated.filter((x) => x.player === t.player);
      if (playerTokens.every((x) => x.state === "finished")) {
        setWinner(t.player);
        play("win");
        confetti({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
        setAnimating(false);
        return;
      }

      setAnimating(false);
      // Extra turn if rolled 6 OR killed OR finished a token
      const extra = diceValue === 6 || killed || t.state === "finished";
      endTurn(extra);
    },
    [tokens, movableTokenIds, diceValue, play, endTurn]
  );

  // Trigger confetti repeats on win
  useEffect(() => {
    if (!winner) return;
    const id = window.setInterval(() => {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } });
    }, 900);
    return () => window.clearInterval(id);
  }, [winner]);

  const restart = () => {
    setTokens(makeInitialTokens());
    setCurrentPlayer("red");
    setDiceValue(1);
    setHasRolled(false);
    setWinner(null);
    setKilledIds(new Set());
    consecutiveSixes.current = 0;
  };

  const counts = useMemo(() => {
    const out: Record<PlayerColor, { base: number; finished: number }> = {
      red: { base: 0, finished: 0 },
      blue: { base: 0, finished: 0 },
      green: { base: 0, finished: 0 },
      yellow: { base: 0, finished: 0 },
    };
    tokens.forEach((t) => {
      if (t.state === "base") out[t.player].base += 1;
      if (t.state === "finished") out[t.player].finished += 1;
    });
    return out;
  }, [tokens]);

  return (
    <main className="min-h-screen px-4 py-6 md:py-10">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl text-glow">LUDO</h1>
          <p className="text-sm text-muted-foreground">Classic 4-player board · roll · move · conquer</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundOn((s) => !s)}
            className="glass-btn h-11 w-11 !p-0 flex items-center justify-center"
            aria-label="Toggle sound"
          >
            {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            onClick={restart}
            className="glass-btn h-11 flex items-center gap-2"
            aria-label="Restart game"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Restart</span>
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        {/* Left players */}
        <div className="flex flex-row gap-3 lg:flex-col">
          <PlayerPanel color="red" active={currentPlayer === "red"} {...counts.red} finishedCount={counts.red.finished} baseCount={counts.red.base} />
          <PlayerPanel color="yellow" active={currentPlayer === "yellow"} {...counts.yellow} finishedCount={counts.yellow.finished} baseCount={counts.yellow.base} />
        </div>

        {/* Board */}
        <div className="flex justify-center">
          <Board
            tokens={tokens}
            currentPlayer={currentPlayer}
            movableTokenIds={movableTokenIds}
            onTokenClick={moveToken}
            killedTokenIds={killedIds}
          />
        </div>

        {/* Right players + dice */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-row gap-3 lg:flex-col">
            <PlayerPanel color="blue" active={currentPlayer === "blue"} {...counts.blue} finishedCount={counts.blue.finished} baseCount={counts.blue.base} />
            <PlayerPanel color="green" active={currentPlayer === "green"} {...counts.green} finishedCount={counts.green.finished} baseCount={counts.green.base} />
          </div>

          <div className="glass mt-2 flex items-center justify-between rounded-2xl p-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Active</p>
              <p className="text-lg font-bold" style={{ color: PLAYER_HEX[currentPlayer] }}>
                {PLAYER_LABEL[currentPlayer]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasRolled
                  ? movableTokenIds.size > 0
                    ? "Pick a token to move"
                    : "No moves – passing…"
                  : "Tap dice to roll"}
              </p>
            </div>
            <Dice
              value={diceValue}
              rolling={rolling}
              onRoll={rollDice}
              disabled={hasRolled || !!winner}
              color={PLAYER_HEX[currentPlayer]}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 grid max-w-6xl gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass rounded-xl p-3"><strong className="text-foreground">Roll a 6</strong> to release a token from base.</div>
        <div className="glass rounded-xl p-3"><strong className="text-foreground">Land on opponent</strong> sends them home (except on ★ safe tiles).</div>
        <div className="glass rounded-xl p-3"><strong className="text-foreground">Roll a 6</strong>, kill, or finish to get an extra turn.</div>
        <div className="glass rounded-xl p-3"><strong className="text-foreground">Get all 4 tokens</strong> to the center to win.</div>
      </section>

      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md animate-fade-in">
          <div className="glass mx-4 w-full max-w-md rounded-3xl p-8 text-center neon-border">
            <Trophy
              className="mx-auto mb-4 h-16 w-16"
              style={{ color: PLAYER_HEX[winner], filter: `drop-shadow(0 0 20px ${PLAYER_HEX[winner]})` }}
            />
            <h2 className="text-3xl font-black text-glow">Victory!</h2>
            <p className="mt-2 text-lg" style={{ color: PLAYER_HEX[winner] }}>
              {PLAYER_LABEL[winner]} wins the game
            </p>
            <button onClick={restart} className="glass-btn mt-6 inline-flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> Play again
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Index;
