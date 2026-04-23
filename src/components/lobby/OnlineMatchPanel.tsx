import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, Loader2, X, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { gameRoute, type GameType } from "@/hooks/useFriendInvite";

interface Props {
  game: GameType;
  gameLabel: string;
  /** Minimum bet (default 50). 0 = friendly. */
  minBet?: number;
}

const PRESETS = [50, 100, 500, 1000, 5000];

export default function OnlineMatchPanel({ game, gameLabel, minBet = 50 }: Props) {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [bet, setBet] = useState<number>(minBet);
  const [searching, setSearching] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const cancelRef = useRef(false);

  // Load queue size for this game (gives users a sense of activity)
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const { count } = await supabase
        .from("matchmaking_queue")
        .select("*", { count: "exact", head: true })
        .eq("game_type", game);
      if (alive) setOnlineCount(count ?? 0);
    };
    refresh();
    const ch = supabase
      .channel(`mmq-count-${game}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matchmaking_queue" }, refresh)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [game]);

  const cleanup = async () => {
    cancelRef.current = true;
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (user) {
      await supabase.from("matchmaking_queue").delete().eq("user_id", user.id);
    }
  };

  useEffect(() => {
    return () => { void cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findMatch = async () => {
    if (!user) return;
    if (bet < minBet) {
      toast({ title: `Minimum bet is ${minBet} coins`, variant: "destructive" });
      return;
    }
    if (bet > (profile?.coins ?? 0)) {
      toast({ title: "Not enough coins", variant: "destructive" });
      return;
    }
    cancelRef.current = false;
    setSearching(true);

    // After 8s without finding a real opponent, auto-match with a random fake user (bot).
    const fallbackTimer = setTimeout(async () => {
      if (cancelRef.current) return;
      try {
        await cleanup();
        cancelRef.current = false;
        // Pick a random fake user persona
        const { data: fakes } = await supabase.from("fake_users").select("id").limit(200);
        if (!fakes || fakes.length === 0) return;
        const pick = fakes[Math.floor(Math.random() * fakes.length)];
        const { data: matchId, error } = await supabase.rpc("start_match_with_fake_user", {
          _fake_user_id: pick.id,
          _game: game as any,
          _bet: bet,
        });
        if (error) throw error;
        if (matchId) {
          await refreshProfile();
          setSearching(false);
          navigate(gameRoute(game, matchId as string, "bot"));
        }
      } catch (err: any) {
        setSearching(false);
        toast({ title: "Failed to start match", description: err?.message ?? "Try again", variant: "destructive" });
      }
    }, 8000);

    try {
      const { data: matchId, error } = await supabase.rpc("join_or_create_game_match", {
        _game: game as any,
        _mode: "1v1",
        _bet: bet,
      });
      if (error) throw error;
      if (matchId) {
        clearTimeout(fallbackTimer);
        await refreshProfile();
        navigate(gameRoute(game, matchId as string));
        return;
      }
      // Queued — wait for someone to match us OR for the 8s fallback to fire
      toast({ title: "Searching for an opponent…", description: `${gameLabel} · ${bet} coin bet` });
      const ch = supabase
        .channel(`mm-${game}-${user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "match_players", filter: `user_id=eq.${user.id}` },
          async (payload) => {
            const mid = (payload.new as any).match_id;
            if (cancelRef.current) return;
            const { data: m } = await supabase
              .from("matches")
              .select("id, game_type")
              .eq("id", mid)
              .maybeSingle();
            if (!m || m.game_type !== game) return;
            clearTimeout(fallbackTimer);
            await refreshProfile();
            await cleanup();
            setSearching(false);
            navigate(gameRoute(game, mid));
          }
        )
        .subscribe();
      channelRef.current = ch;
    } catch (err: any) {
      clearTimeout(fallbackTimer);
      setSearching(false);
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    }
  };

  const cancel = async () => {
    await cleanup();
    setSearching(false);
    toast({ title: "Search cancelled" });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Globe2 className="h-3 w-3" /> Play with Online Users
        </h2>
        <span className="text-xs text-muted-foreground">
          {onlineCount > 0 ? <><span className="inline-block h-2 w-2 rounded-full bg-green-400 mr-1 animate-pulse" />{onlineCount} searching</> : "Be the first to queue"}
        </span>
      </div>

      <div className="glass rounded-2xl p-4 space-y-3">
        {!searching ? (
          <>
            <div className="flex flex-wrap gap-2">
              {PRESETS.filter((p) => p >= minBet).map((p) => (
                <button
                  key={p}
                  onClick={() => setBet(p)}
                  disabled={p > (profile?.coins ?? 0)}
                  className={`glass-btn h-9 px-3 text-xs font-semibold ${bet === p ? "bg-primary/30 ring-1 ring-primary" : ""} disabled:opacity-30`}
                >
                  🪙 {p}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={minBet}
                max={profile?.coins ?? 0}
                value={bet}
                onChange={(e) => setBet(Math.max(0, Math.min(profile?.coins ?? 0, Number(e.target.value))))}
                className="flex-1 h-10 rounded-lg bg-secondary/50 px-3 text-sm font-bold border border-border"
              />
              <button
                onClick={findMatch}
                disabled={bet < minBet || bet > (profile?.coins ?? 0)}
                className="glass-btn h-10 px-4 bg-gradient-to-r from-primary/40 to-accent/40 font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Globe2 className="h-4 w-4" /> Find Online Match
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              You'll be auto-matched with another online {gameLabel} player at the same bet. Both lock <Coins className="inline h-3 w-3 text-yellow-400" /> {bet} coins · winner takes <span className="font-bold text-yellow-400">{bet * 2}</span>.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-semibold">Searching for an opponent…</p>
            <p className="text-xs text-muted-foreground">{gameLabel} · 🪙 {bet} coin bet</p>
            <button onClick={cancel} className="glass-btn h-9 px-4 flex items-center gap-2 text-red-400">
              <X className="h-4 w-4" /> Cancel Search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
