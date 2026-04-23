import { useEffect, useState, useCallback } from "react";
import { Users, Wifi, RefreshCw, Loader2, Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type GameType } from "@/hooks/useFriendInvite";
import ChallengePlayerDialog from "@/components/hub/ChallengePlayerDialog";

interface OnlineUser {
  id: string;
  username: string;
  display_name: string | null;
  game_id: string | null;
  coins: number;
  wins: number;
  last_seen_at: string;
  avatar_url: string | null;
  is_fake: boolean;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 30) return "now";
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function initials(s?: string | null) {
  return (s ?? "?").slice(0, 2).toUpperCase();
}

interface Props {
  /** When set, clicking a user starts a match for this game type. Defaults to "ludo". */
  game?: GameType;
}

export default function OnlinePlayersPanel({ game = "ludo" }: Props) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_online_users", { _limit: 250 });
    if (!error && data) setUsers(data as OnlineUser[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const playWithFake = async (u: OnlineUser) => {
    if (!u.is_fake) {
      toast({ title: "This player is online — invite them as a friend or play random match." });
      return;
    }
    setStartingId(u.id);
    try {
      const { data: matchId, error } = await supabase.rpc("start_match_with_fake_user", {
        _fake_user_id: u.id,
        _game: game as never,
        _bet: 0,
      });
      if (error) throw error;
      if (matchId) navigate(gameRoute(game, matchId as string));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Try again";
      toast({ title: "Failed to start match", description: message, variant: "destructive" });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <section className="glass rounded-3xl p-5 ring-1 ring-white/10">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Wifi className="h-5 w-5 text-emerald-400" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <h3 className="font-black text-lg">Online Players</h3>
          <span className="ml-1 text-xs glass px-2 py-0.5 rounded-full font-bold">
            {loading ? "…" : users.length}
          </span>
        </div>
        <button
          onClick={() => { setLoading(true); void load(); }}
          className="glass-btn h-8 w-8 flex items-center justify-center"
          aria-label="Refresh"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </header>

      {users.length === 0 && !loading && (
        <div className="text-center py-6 text-muted-foreground text-sm flex flex-col items-center gap-2">
          <Users className="h-8 w-8 opacity-30" />
          <span>No one online right now.</span>
        </div>
      )}

      <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <Avatar className="h-9 w-9 ring-2 ring-emerald-400/40">
                  {u.avatar_url ? <AvatarImage src={u.avatar_url} alt={u.display_name ?? u.username} /> : null}
                  <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-primary/40 to-accent/40">
                    {initials(u.display_name ?? u.username)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{u.display_name || u.username}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  ID: {u.game_id ?? "—"} · {u.wins}W · 🪙 {u.coins}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] uppercase font-bold text-emerald-400">{timeAgo(u.last_seen_at)}</span>
              <button
                onClick={() => playWithFake(u)}
                disabled={startingId === u.id}
                className="glass-btn h-7 px-2 text-[10px] font-bold flex items-center gap-1 bg-gradient-to-r from-primary/30 to-accent/30 disabled:opacity-50"
                title={u.is_fake ? "Play vs this user" : "Play random / invite"}
              >
                {startingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Swords className="h-3 w-3" />}
                Play
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
