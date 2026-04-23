import { useEffect, useState, useCallback } from "react";
import { Users, Wifi, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OnlineUser {
  id: string;
  username: string;
  display_name: string | null;
  game_id: string | null;
  coins: number;
  wins: number;
  last_seen_at: string;
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 30) return "now";
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export default function OnlinePlayersPanel() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_online_users", { _limit: 30 });
    if (!error && data) setUsers(data as OnlineUser[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

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

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{u.display_name || u.username}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  ID: {u.game_id ?? "—"} · {u.wins}W
                </div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold text-emerald-400 flex-shrink-0">{timeAgo(u.last_seen_at)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
