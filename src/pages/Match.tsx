import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { Volume2, VolumeX, RotateCcw, Trophy, ArrowLeft, Loader2 } from "lucide-react";
import { Board } from "@/components/ludo/Board";
import { CenterDice } from "@/components/ludo/CenterDice";
import { MatchChat } from "@/components/ludo/MatchChat";
import {
  PLAYERS,
  PLAYER_HEX,
  PlayerColor,
  Token,
  getTokenCell,
  isOnSafeTile,
  tileKey,
} from "@/game/ludoConstants";
import { chooseBotMove } from "@/game/botStrategy";
import { useSounds } from "@/game/useSounds";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface SeatInfo {
  color: PlayerColor;
  isBot: boolean;
  name: string;
  userId: string | null;
}

function makeInitialTokens(seatColors: PlayerColor[]): Token[] {
  const tokens: Token[] = [];
  seatColors.forEach((p) => {
    for (let i = 0; i < 4; i++) {
      tokens.push({ id: `${p}-${i}`, player: p, state: "base", progress: 0, baseSlot: i });
    }
  });
  return tokens;
}

export default function Match() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  const [seats, setSeats] = useState<SeatInfo[] | null>(null);
  const [matchMode, setMatchMode] = useState<string>("");
  const [loadingMatch, setLoadingMatch] = useState(true);

  const [tokens, setTokens] = useState<Token[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>("red");
  const [diceValue, setDiceValue] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [winner, setWinner] = useState<PlayerColor | null>(null);
  const [killedIds, setKilledIds] = useState<Set<string>>(new Set());
  const [animating, setAnimating] = useState(false);
  const movingRef = useRef(false);
  const consecutiveSixes = useRef(0);

  const play = useSounds(soundOn);

  // Load match
  useEffect(() => {
    if (!matchId || !user) return;
    (async () => {
      setLoadingMatch(true);
      const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
      if (!match) {
        toast({ title: "Match not found", variant: "destructive" });
        navigate("/lobby");
        return;
      }
      setMatchMode(match.mode);
      const { data: players } = await supabase
        .from("match_players")
        .select("color, is_bot, bot_name, user_id, profiles:user_id ( username )")
        .eq("match_id", matchId);
      const seatList: SeatInfo[] = (players ?? []).map((p: any) => ({
        color: p.color as PlayerColor,
        isBot: p.is_bot,
        name: p.is_bot ? (p.bot_name ?? "Bot") : (p.profiles?.username ?? "Player"),
        userId: p.user_id,
      }));
      // sort by PLAYERS order
      seatList.sort((a, b) => PLAYERS.indexOf(a.color) - PLAYERS.indexOf(b.color));
      setSeats(seatList);
      setTokens(makeInitialTokens(seatList.map((s) => s.color)));
      setCurrentPlayer(seatList[0]?.color ?? "red");
      setLoadingMatch(false);
    })();
  }, [matchId, user, navigate]);

  const seatByColor = useMemo(() => {
    const m = new Map<PlayerColor, SeatInfo>();
    seats?.forEach((s) => m.set(s.color, s));
    return m;
  }, [seats]);

  const playerNames = useMemo(() => {
    const obj: Partial<Record<PlayerColor, string>> = {};
    seats?.forEach((s) => { obj[s.color] = s.name; });
    return obj;
  }, [seats]);

  const isHumanTurn = !!seatByColor.get(currentPlayer) && !seatByColor.get(currentPlayer)!.isBot;

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
    if (!seats || seats.length === 0) return from;
    const order = seats.map((s) => s.color);
    const idx = order.indexOf(from);
    return order[(idx + 1) % order.length];
  }, [seats]);

  const endTurn = useCallback((gotExtra: boolean) => {
    setHasRolled(false);
    if (gotExtra && consecutiveSixes.current < 3) return;
    consecutiveSixes.current = 0;
    setCurrentPlayer((p) => nextPlayer(p));
  }, [nextPlayer]);

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

  const moveToken = useCallback(async (id: string) => {
    if (movingRef.current) return;
    const token = tokens.find((t) => t.id === id);
    if (!token) return;
    const stepsToMove = diceValue; // snapshot before any state changes
    movingRef.current = true;
    setAnimating(true);

    const updated: Token[] = tokens.map((t) => ({ ...t }));
    const t = updated.find((x) => x.id === id)!;

    if (t.state === "base" && stepsToMove === 6) {
      t.state = "active";
      t.progress = 0;
      play("move");
      setTokens([...updated]);
      await new Promise((r) => setTimeout(r, 250));
    } else if (t.state === "active") {
      for (let i = 0; i < stepsToMove; i++) {
        t.progress += 1;
        setTokens([...updated]);
        play("move");
        await new Promise((r) => setTimeout(r, 130));
      }
      if (t.progress === 56) t.state = "finished";
    }

    let killed = false;
    if (t.state === "active" && !isOnSafeTile(t)) {
      const [r, c] = getTokenCell(t);
      const k = tileKey(r, c);
      const enemiesHere = updated.filter((o) => o.id !== t.id && o.state === "active" && o.player !== t.player);
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
        toKill.forEach((o) => { o.state = "base"; o.progress = 0; });
        setTokens([...updated]);
        setKilledIds(new Set());
      }
    }

    const playerTokens = updated.filter((x) => x.player === t.player);
    if (playerTokens.every((x) => x.state === "finished")) {
      setWinner(t.player);
      play("win");
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
      void recordResult(t.player);
      setAnimating(false);
      movingRef.current = false;
      return;
    }

    setAnimating(false);
    movingRef.current = false;
    const extra = stepsToMove === 6 || killed || t.state === "finished";
    endTurn(extra);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, diceValue, play, endTurn]);

  // record win/loss + coins for the human player in bot matches
  const recordResult = async (winColor: PlayerColor) => {
    if (!user || !profile || !seats) return;
    const mySeat = seats.find((s) => s.userId === user.id);
    if (!mySeat) return;
    const won = mySeat.color === winColor;
    const coinsDelta = won ? 100 : -20;
    await supabase.from("profiles").update({
      wins: profile.wins + (won ? 1 : 0),
      losses: profile.losses + (won ? 0 : 1),
      coins: Math.max(0, profile.coins + coinsDelta),
    }).eq("id", user.id);
    await supabase.from("matches").update({
      status: "finished",
      winner_id: won ? user.id : null,
    }).eq("id", matchId!);
    refreshProfile();
  };

  // Bot autoplay
  useEffect(() => {
    if (!seats || winner || loadingMatch) return;
    const seat = seatByColor.get(currentPlayer);
    if (!seat || !seat.isBot) return;
    if (rolling || animating) return;

    if (!hasRolled) {
      const t = window.setTimeout(rollDice, 700);
      return () => window.clearTimeout(t);
    } else {
      const t = window.setTimeout(() => {
        const choice = chooseBotMove(tokens, currentPlayer, diceValue);
        if (choice) moveToken(choice);
      }, 600);
      return () => window.clearTimeout(t);
    }
  }, [seats, currentPlayer, hasRolled, rolling, animating, winner, diceValue, tokens, loadingMatch, rollDice, moveToken, seatByColor]);

  // Win confetti loop
  useEffect(() => {
    if (!winner) return;
    const id = window.setInterval(() => {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } });
    }, 900);
    return () => window.clearInterval(id);
  }, [winner]);

  const restart = () => {
    if (!seats) return;
    setTokens(makeInitialTokens(seats.map((s) => s.color)));
    setCurrentPlayer(seats[0].color);
    setDiceValue(1);
    setHasRolled(false);
    setWinner(null);
    setKilledIds(new Set());
    consecutiveSixes.current = 0;
  };

  const handleTokenClick = (id: string) => {
    if (!isHumanTurn) return;
    if (!movableTokenIds.has(id)) return;
    moveToken(id);
  };

  const handleRollClick = () => {
    if (!isHumanTurn) return;
    rollDice();
  };

  if (loadingMatch || !seats) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const currentSeat = seatByColor.get(currentPlayer);

  return (
    <main className="min-h-screen px-2 py-4 md:py-6">
      <header className="mx-auto mb-4 flex max-w-6xl items-center justify-between px-2">
        <button onClick={() => navigate("/lobby")} className="glass-btn h-10 flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Lobby</span>
        </button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Mode</p>
          <p className="text-sm font-bold uppercase">{matchMode}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundOn((s) => !s)}
            className="glass-btn h-10 w-10 !p-0 flex items-center justify-center"
            aria-label="Toggle sound"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button onClick={restart} className="glass-btn h-10 flex items-center gap-2 text-sm">
            <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Restart</span>
          </button>
        </div>
      </header>

      {/* Active player banner – shows just color glow + name, no big "your turn" label */}
      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-center gap-3">
        <span
          className="h-3 w-3 rounded-full animate-pulse"
          style={{ background: PLAYER_HEX[currentPlayer], boxShadow: `0 0 18px ${PLAYER_HEX[currentPlayer]}` }}
        />
        <p className="text-sm font-semibold" style={{ color: PLAYER_HEX[currentPlayer] }}>
          {currentSeat?.name ?? currentPlayer}
          {currentSeat?.isBot ? " (bot)" : ""} · {hasRolled ? (movableTokenIds.size > 0 ? "move a token" : "no moves") : "to roll"}
        </p>
      </div>

      <section className="mx-auto flex max-w-6xl justify-center">
        <Board
          tokens={tokens}
          currentPlayer={currentPlayer}
          movableTokenIds={movableTokenIds}
          onTokenClick={handleTokenClick}
          killedTokenIds={killedIds}
          playerNames={playerNames}
          centerContent={
            <CenterDice
              value={diceValue}
              rolling={rolling}
              onRoll={handleRollClick}
              disabled={hasRolled || !!winner || !isHumanTurn}
              color={PLAYER_HEX[currentPlayer]}
            />
          }
        />
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
              {seatByColor.get(winner)?.name ?? winner} wins the game
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button onClick={restart} className="glass-btn inline-flex items-center gap-2">
                <RotateCcw className="h-4 w-4" /> Play again
              </button>
              <button onClick={() => navigate("/lobby")} className="glass-btn inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Lobby
              </button>
            </div>
          </div>
        </div>
      )}
      {matchId && seats && seats.some((s) => !s.isBot && s.userId !== user?.id) && (
        <MatchChat matchId={matchId} />
      )}
    </main>
  );
}
