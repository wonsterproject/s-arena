import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { Volume2, VolumeX, Trophy, ArrowLeft, Loader2, Clock, Users, RotateCcw, Settings, Sparkles, Palette } from "lucide-react";
import { Board, type BoardTheme } from "@/components/ludo/Board";
import { CenterDice } from "@/components/ludo/CenterDice";
import { MatchChat } from "@/components/ludo/MatchChat";
import { PlayerCard } from "@/components/ludo/PlayerCard";
import { AmbientParticles } from "@/components/ludo/AmbientParticles";
import { LavaBackground } from "@/components/ludo/LavaBackground";
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
import PreMatchVS from "@/components/match/PreMatchVS";

interface SeatInfo {
  color: PlayerColor;
  isBot: boolean;
  name: string;
  userId: string | null;
  avatarUrl: string | null;
  coins: number | null;
}

interface GameState {
  tokens: Token[];
  currentPlayer: PlayerColor;
  diceValue: number;
  hasRolled: boolean;
  consecutiveSixes: number;
  winner: PlayerColor | null;
  turnStartAt: number; // ms epoch
  version: number;
}

const TURN_TIMEOUT_MS = 30_000;

function makeInitialTokens(seatColors: PlayerColor[]): Token[] {
  const tokens: Token[] = [];
  seatColors.forEach((p) => {
    for (let i = 0; i < 4; i++) {
      tokens.push({ id: `${p}-${i}`, player: p, state: "base", progress: 0, baseSlot: i });
    }
  });
  return tokens;
}

function makeInitialState(seatColors: PlayerColor[]): GameState {
  return {
    tokens: makeInitialTokens(seatColors),
    currentPlayer: seatColors[0] ?? "red",
    diceValue: 1,
    hasRolled: false,
    consecutiveSixes: 0,
    winner: null,
    turnStartAt: Date.now(),
    version: 1,
  };
}

export default function Match() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();

  const [seats, setSeats] = useState<SeatInfo[] | null>(null);
  const [matchMode, setMatchMode] = useState<string>("");
  const [matchStatus, setMatchStatus] = useState<string>("");
  const [hostId, setHostId] = useState<string | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(true);
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(() => {
    if (typeof window === "undefined") return "classic";
    // Respect any saved preference (existing users keep "realistic" if they had chosen it).
    // Default for everyone else is now "classic".
    return (localStorage.getItem("ludo:boardTheme") as BoardTheme) || "classic";
  });
  useEffect(() => {
    try { localStorage.setItem("ludo:boardTheme", boardTheme); } catch {}
  }, [boardTheme]);
  const [killedIds, setKilledIds] = useState<Set<string>>(new Set());
  const [animating, setAnimating] = useState(false);
  const [rollingLocal, setRollingLocal] = useState(false);
  const [now, setNow] = useState(Date.now());
  const movingRef = useRef(false);
  const lastVersionApplied = useRef<number>(0);
  const committingRef = useRef(false);
  // Pre-match VS animation: shown once when status flips waiting → active.
  const [showVS, setShowVS] = useState(false);
  const vsShownRef = useRef(false);

  const play = useSounds(soundOn);

  // Tick clock for turn timer display
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // Load match + players + state
  const loadMatch = useCallback(async () => {
    if (!matchId || !user) return;
    const { data: match } = await supabase.from("matches").select("*").eq("id", matchId).maybeSingle();
    if (!match) {
      toast({ title: "Match not found", variant: "destructive" });
      navigate("/lobby");
      return;
    }
    setMatchMode(match.mode);
    setMatchStatus(match.status);
    setHostId(match.host_id);
    const { data: players } = await supabase
      .from("match_players")
      .select("color, is_bot, bot_name, user_id, profiles:user_id ( username, avatar_url, coins )")
      .eq("match_id", matchId);
    const seatList: SeatInfo[] = (players ?? []).map((p: any) => ({
      color: p.color as PlayerColor,
      isBot: p.is_bot,
      name: p.is_bot ? (p.bot_name ?? "Bot") : (p.profiles?.username ?? "Player"),
      userId: p.user_id,
      avatarUrl: p.is_bot ? null : (p.profiles?.avatar_url ?? null),
      coins: p.is_bot ? null : (p.profiles?.coins ?? null),
    }));
    seatList.sort((a, b) => PLAYERS.indexOf(a.color) - PLAYERS.indexOf(b.color));
    setSeats(seatList);

    const seatColors = seatList.map((s) => s.color);
    let gs: GameState | null = (match.state as any) ?? null;
    if (!gs || !gs.tokens) {
      gs = makeInitialState(seatColors);
      // Host initializes if active
      if (match.status === "active" && match.host_id === user.id) {
        await supabase.from("matches").update({ state: gs as any }).eq("id", matchId);
      }
    }
    if (gs.version > lastVersionApplied.current) {
      lastVersionApplied.current = gs.version;
      setState(gs);
      stateRef.current = gs;
    }
    setLoadingMatch(false);
  }, [matchId, user, navigate]);

  useEffect(() => { void loadMatch(); }, [loadMatch]);

  // Realtime subscriptions
  useEffect(() => {
    if (!matchId) return;
    const ch = supabase
      .channel(`match-rt-${matchId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        (payload) => {
          const newRow: any = payload.new;
          if (newRow.status !== matchStatus) {
            if (matchStatus === "waiting" && newRow.status === "active" && !vsShownRef.current) {
              vsShownRef.current = true;
              setShowVS(true);
            }
            setMatchStatus(newRow.status);
          }
          const incoming = newRow.state as GameState | null;
          if (incoming && incoming.version && incoming.version > lastVersionApplied.current && !movingRef.current) {
            lastVersionApplied.current = incoming.version;
            stateRef.current = incoming;
            setState(incoming);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_players", filter: `match_id=eq.${matchId}` },
        () => { void loadMatch(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId, matchStatus, loadMatch]);

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

  const mySeat = useMemo(() => seats?.find((s) => s.userId === user?.id) ?? null, [seats, user]);
  const isMyTurn = !!state && !!mySeat && state.currentPlayer === mySeat.color && !state.winner;
  const currentSeat = state ? seatByColor.get(state.currentPlayer) : null;
  // Host drives bot turns to avoid double-write
  const amHost = !!user && hostId === user.id;
  const isBotTurn = !!currentSeat?.isBot;

  const movableTokenIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !state.hasRolled || rollingLocal || animating || state.winner) return ids;
    state.tokens
      .filter((t) => t.player === state.currentPlayer)
      .forEach((t) => {
        if (t.state === "finished") return;
        if (t.state === "base") {
          if (state.diceValue === 6) ids.add(t.id);
        } else if (t.state === "active") {
          if (t.progress + state.diceValue <= 56) ids.add(t.id);
        }
      });
    return ids;
  }, [state, rollingLocal, animating]);

  const nextPlayer = useCallback((from: PlayerColor): PlayerColor => {
    if (!seats || seats.length === 0) return from;
    const order = seats.map((s) => s.color);
    const idx = order.indexOf(from);
    return order[(idx + 1) % order.length];
  }, [seats]);

  // Commit a state update to DB (and locally optimistically)
  const commit = useCallback(async (mutator: (s: GameState) => GameState) => {
    if (!matchId || !stateRef.current) return;
    if (committingRef.current) return;
    committingRef.current = true;
    try {
      const next = mutator({ ...stateRef.current });
      next.version = (stateRef.current.version ?? 1) + 1;
      lastVersionApplied.current = next.version;
      stateRef.current = next;
      setState(next);
      await supabase.from("matches").update({ state: next as any }).eq("id", matchId);
    } finally {
      committingRef.current = false;
    }
  }, [matchId]);

  const finalizeWin = useCallback(async (winColor: PlayerColor) => {
    if (!matchId) return;
    const winnerSeat = seats?.find((s) => s.color === winColor);
    const winnerUserId = winnerSeat?.userId ?? null;
    try {
      await supabase.rpc("finalize_match", { _match_id: matchId, _winner_id: winnerUserId });
      refreshProfile();
    } catch (e: any) {
      // ignore double-finalize
    }
  }, [matchId, seats, refreshProfile]);

  const endTurn = useCallback((extra: boolean) => {
    void commit((s) => {
      const sixes = extra ? s.consecutiveSixes : 0;
      if (extra && sixes < 3) {
        return { ...s, hasRolled: false, turnStartAt: Date.now() };
      }
      return {
        ...s,
        hasRolled: false,
        consecutiveSixes: 0,
        currentPlayer: nextPlayer(s.currentPlayer),
        turnStartAt: Date.now(),
      };
    });
  }, [commit, nextPlayer]);

  const rollDice = useCallback(async () => {
    const s = stateRef.current;
    if (!s || s.hasRolled || s.winner || rollingLocal || animating) return;
    setRollingLocal(true);
    play("dice");
    const finalValue = Math.floor(Math.random() * 6) + 1;
    await new Promise((r) => setTimeout(r, 700));
    setRollingLocal(false);
    const sixes = finalValue === 6 ? s.consecutiveSixes + 1 : 0;
    await commit((cur) => ({ ...cur, diceValue: finalValue, hasRolled: true, consecutiveSixes: sixes, turnStartAt: Date.now() }));
    // If no moves possible, auto end turn
    setTimeout(() => {
      const cur = stateRef.current;
      if (!cur) return;
      const playerToks = cur.tokens.filter((t) => t.player === cur.currentPlayer);
      const canMove = playerToks.some((t) => {
        if (t.state === "finished") return false;
        if (t.state === "base") return finalValue === 6;
        return t.progress + finalValue <= 56;
      });
      if (!canMove) endTurn(finalValue === 6);
    }, 600);
  }, [play, commit, endTurn, rollingLocal, animating]);

  const moveToken = useCallback(async (id: string) => {
    if (movingRef.current) return;
    const s = stateRef.current;
    if (!s) return;
    const token = s.tokens.find((t) => t.id === id);
    if (!token) return;
    const stepsToMove = s.diceValue;
    movingRef.current = true;
    setAnimating(true);

    const updated: Token[] = s.tokens.map((t) => ({ ...t }));
    const t = updated.find((x) => x.id === id)!;

    if (t.state === "base" && stepsToMove === 6) {
      t.state = "active";
      t.progress = 0;
      play("move");
      await new Promise((r) => setTimeout(r, 200));
    } else if (t.state === "active") {
      for (let i = 0; i < stepsToMove; i++) {
        t.progress += 1;
        play("move");
        // Local visual update during animation only
        setState((prev) => prev ? { ...prev, tokens: [...updated] } : prev);
        await new Promise((r) => setTimeout(r, 110));
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
        await new Promise((r) => setTimeout(r, 450));
        toKill.forEach((o) => { o.state = "base"; o.progress = 0; });
        setKilledIds(new Set());
      }
    }

    const playerTokens = updated.filter((x) => x.player === t.player);
    const won = playerTokens.every((x) => x.state === "finished");
    const extra = stepsToMove === 6 || killed || t.state === "finished";

    setAnimating(false);
    movingRef.current = false;

    // Commit final result
    await commit((cur) => {
      const next: GameState = { ...cur, tokens: updated };
      if (won) {
        next.winner = t.player;
      } else {
        const sixes = extra ? cur.consecutiveSixes : 0;
        if (extra && sixes < 3) {
          next.hasRolled = false;
          next.turnStartAt = Date.now();
        } else {
          next.hasRolled = false;
          next.consecutiveSixes = 0;
          next.currentPlayer = nextPlayer(cur.currentPlayer);
          next.turnStartAt = Date.now();
        }
      }
      return next;
    });

    if (won) {
      play("win");
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.5 } });
      void finalizeWin(t.player);
    }
  }, [play, commit, nextPlayer, finalizeWin]);

  // Driver: am I responsible for current turn?
  const iAmDriver = useMemo(() => {
    if (!state || !user || !seats) return false;
    if (state.winner) return false;
    if (isBotTurn) return amHost; // host drives bots
    // Human turn → only that human drives
    return mySeat?.color === state.currentPlayer;
  }, [state, user, seats, isBotTurn, amHost, mySeat]);

  // Bot autoplay (only host drives) — guard so we only schedule one action per (player, hasRolled, version)
  const botActionKeyRef = useRef<string>("");
  useEffect(() => {
    if (!state || !seats || state.winner || loadingMatch) return;
    if (!isBotTurn || !amHost) return;
    if (rollingLocal || animating || movingRef.current) return;

    const key = `${state.currentPlayer}|${state.hasRolled ? "moved" : "roll"}|${state.version}`;
    if (botActionKeyRef.current === key) return;
    botActionKeyRef.current = key;

    if (!state.hasRolled) {
      const t = window.setTimeout(() => { void rollDice(); }, 800);
      return () => window.clearTimeout(t);
    } else {
      const t = window.setTimeout(() => {
        const cur = stateRef.current;
        if (!cur) return;
        const choice = chooseBotMove(cur.tokens, cur.currentPlayer, cur.diceValue);
        if (choice) {
          void moveToken(choice);
        } else {
          // No movable tokens — end the turn so the bot doesn't get stuck
          endTurn(false);
        }
      }, 700);
      return () => window.clearTimeout(t);
    }
  }, [state, seats, isBotTurn, amHost, rollingLocal, animating, loadingMatch, rollDice, moveToken]);

  // Turn timer auto-skip — driver enforces
  useEffect(() => {
    if (!state || !iAmDriver || state.winner || isBotTurn) return;
    if (rollingLocal || animating) return;
    const elapsed = now - state.turnStartAt;
    if (elapsed > TURN_TIMEOUT_MS + 1500) {
      // Skip turn
      if (!state.hasRolled) {
        // Auto-roll then skip if no move
        void rollDice();
      } else if (movableTokenIds.size === 0) {
        endTurn(false);
      } else {
        // Auto-pick first movable token
        const first = Array.from(movableTokenIds)[0];
        if (first) void moveToken(first);
      }
    }
  }, [state, iAmDriver, isBotTurn, rollingLocal, animating, now, movableTokenIds, rollDice, endTurn, moveToken]);

  // Win confetti loop
  useEffect(() => {
    if (!state?.winner) return;
    const id = window.setInterval(() => {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.4 } });
    }, 900);
    return () => window.clearInterval(id);
  }, [state?.winner]);

  const handleTokenClick = (id: string) => {
    if (!isMyTurn || isBotTurn) return;
    if (!movableTokenIds.has(id)) return;
    void moveToken(id);
  };

  const handleRollClick = () => {
    if (!isMyTurn || isBotTurn) return;
    void rollDice();
  };

  if (loadingMatch || !seats || !state) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  // Waiting room: friend match not yet active (opponent hasn't accepted)
  if (matchStatus === "waiting") {
    const humanSeats = seats.filter((s) => !s.isBot);
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="glass rounded-3xl p-8 max-w-md w-full text-center neon-border">
          <Users className="h-14 w-14 mx-auto mb-4 text-primary animate-pulse" />
          <h2 className="text-2xl font-black mb-2">Waiting for opponent…</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Match start hoga jab aapka friend invite accept karega.
          </p>
          <div className="space-y-2 mb-4">
            {humanSeats.map((s) => (
              <div key={s.color} className="flex items-center justify-between rounded-xl bg-secondary/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: PLAYER_HEX[s.color], boxShadow: `0 0 12px ${PLAYER_HEX[s.color]}` }} />
                  <span className="text-sm font-semibold">@{s.name}</span>
                </div>
                <span className="text-xs text-green-400">✓ Joined</span>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/lobby")} className="glass-btn h-10 px-4 inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Lobby
          </button>
        </div>
      </main>
    );
  }

  const turnRemaining = Math.max(0, Math.ceil((TURN_TIMEOUT_MS - (now - state.turnStartAt)) / 1000));

  // Tokens finished count per color
  const finishedByColor: Record<PlayerColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  state.tokens.forEach((t) => { if (t.state === "finished") finishedByColor[t.player]++; });

  const renderCard = (color: PlayerColor) => {
    const seat = seatByColor.get(color);
    if (!seat) return <div className="w-[96px]" aria-hidden />;
    return (
      <PlayerCard
        color={color}
        name={seat.name}
        active={state.currentPlayer === color}
        isBot={seat.isBot}
        isYou={seat.userId === user?.id}
        avatarUrl={seat.avatarUrl}
        coins={seat.coins}
        finishedCount={finishedByColor[color]}
      />
    );
  };

  return (
    <main className="relative min-h-screen px-2 py-3 md:py-5 overflow-hidden bg-[hsl(225_30%_6%)]">
      {/* Realistic theme: video itself is the environment — no extra glowing background */}

      {/* Top header */}
      <header className="mx-auto mb-3 flex max-w-6xl items-center justify-between px-2">
        <button onClick={() => navigate("/lobby")} className="glass-btn h-10 flex items-center gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Lobby</span>
        </button>

        {/* Your Turn banner (center) */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative overflow-hidden rounded-full">
            <div className="turn-banner">
              <Sparkles className="h-3.5 w-3.5" />
              {state.winner ? "Game Over" : isMyTurn ? "Your Turn" : (isBotTurn ? "Bot Turn" : `${currentSeat?.name ?? state.currentPlayer}'s Turn`)}
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            {/* sheen sweep */}
            <span
              className="pointer-events-none absolute inset-y-0 -inset-x-2 animate-sheen"
              style={{
                background: "linear-gradient(110deg, transparent 30%, hsl(0 0% 100% / 0.55) 50%, transparent 70%)",
                width: "40%",
                mixBlendMode: "overlay",
              }}
            />
          </div>
          {!state.winner && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold"
              style={{
                background: "hsl(0 0% 0% / 0.5)",
                boxShadow: `inset 0 0 0 1px ${PLAYER_HEX[state.currentPlayer]}, 0 0 12px ${PLAYER_HEX[state.currentPlayer]}55`,
                color: PLAYER_HEX[state.currentPlayer],
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ background: PLAYER_HEX[state.currentPlayer], boxShadow: `0 0 8px ${PLAYER_HEX[state.currentPlayer]}` }}
              />
              {state.hasRolled ? `Move (${state.diceValue})` : "Roll the Dice!"}
              {!isBotTurn && (
                <span className={`ml-1 inline-flex items-center gap-0.5 ${turnRemaining <= 5 ? "text-red-300" : "opacity-80"}`}>
                  <Clock className="h-3 w-3" />{turnRemaining}s
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBoardTheme((t) => (t === "realistic" ? "classic" : "realistic"))}
            className="glass-btn h-10 px-3 inline-flex items-center gap-1.5 text-xs font-bold"
            aria-label="Switch board theme"
            title={boardTheme === "realistic" ? "Switch to Classic theme" : "Switch to Realistic theme"}
          >
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline capitalize">{boardTheme === "realistic" ? "Classic" : "Realistic"}</span>
          </button>
          <button
            onClick={() => setSoundOn((s) => !s)}
            className="glass-btn h-10 w-10 !p-0 flex items-center justify-center"
            aria-label="Toggle sound"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main game grid: on mobile only board; on sm+ side player cards */}
      <section className="mx-auto flex max-w-6xl items-center justify-center gap-3 sm:gap-4 px-1">
        {/* Left column: hidden on mobile */}
        <div className="hidden sm:flex flex-col gap-3 sm:gap-4 shrink-0">
          {renderCard("red")}
          {renderCard("green")}
        </div>

        {/* Board — fills available width on mobile */}
        <div className="flex w-full max-w-[760px] justify-center">
          <Board
            tokens={state.tokens}
            currentPlayer={state.currentPlayer}
            movableTokenIds={movableTokenIds}
            onTokenClick={handleTokenClick}
            killedTokenIds={killedIds}
            playerNames={playerNames}
            theme={boardTheme}
            centerContent={
              <CenterDice
                value={state.diceValue}
                rolling={rollingLocal}
                onRoll={handleRollClick}
                disabled={state.hasRolled || !!state.winner || !isMyTurn || isBotTurn}
                color={PLAYER_HEX[state.currentPlayer]}
              />
            }
          />
        </div>

        {/* Right column: hidden on mobile */}
        <div className="hidden sm:flex flex-col gap-3 sm:gap-4 shrink-0">
          {renderCard("blue")}
          {renderCard("yellow")}
        </div>
      </section>

      {state.winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-md animate-fade-in">
          <div className="glass mx-4 w-full max-w-md rounded-3xl p-8 text-center neon-border">
            <Trophy
              className="mx-auto mb-4 h-16 w-16"
              style={{ color: PLAYER_HEX[state.winner], filter: `drop-shadow(0 0 20px ${PLAYER_HEX[state.winner]})` }}
            />
            <h2 className="text-3xl font-black text-glow">Victory!</h2>
            <p className="mt-2 text-lg" style={{ color: PLAYER_HEX[state.winner] }}>
              {seatByColor.get(state.winner)?.name ?? state.winner} wins the game
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
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
