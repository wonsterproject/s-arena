import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Coins, Medal, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  id: string;
  username: string;
  display_name: string | null;
  wins: number;
  losses: number;
  coins: number;
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"wins" | "coins">("wins");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, wins, losses, coins")
      .order(tab, { ascending: false })
      .limit(50);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  const initials = (s?: string | null) => (s ?? "?").slice(0, 2).toUpperCase();
  const medal = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

  return (
    <main className="min-h-screen px-4 py-6">
      <header className="mx-auto mb-6 flex max-w-3xl items-center justify-between">
        <button onClick={() => navigate("/lobby")} className="glass-btn h-10 flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> <span className="text-sm">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-400" />
          <h1 className="text-xl font-black text-glow">Leaderboard</h1>
        </div>
        <div className="w-10" />
      </header>

      <section className="mx-auto max-w-3xl">
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTab("wins")}
            className={`glass-btn flex-1 flex items-center justify-center gap-2 ${tab === "wins" ? "bg-gradient-to-r from-primary/40 to-accent/40" : "opacity-70"}`}
          >
            <Trophy className="h-4 w-4" /> Top Wins
          </button>
          <button
            onClick={() => setTab("coins")}
            className={`glass-btn flex-1 flex items-center justify-center gap-2 ${tab === "coins" ? "bg-gradient-to-r from-primary/40 to-accent/40" : "opacity-70"}`}
          >
            <Coins className="h-4 w-4" /> Richest
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="glass rounded-2xl divide-y divide-border/40 overflow-hidden">
            {rows.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No players yet.</p>}
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className="w-10 text-center text-lg font-black">{medal(i)}</div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 text-sm font-bold">
                  {initials(r.username)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{r.display_name ?? r.username}</p>
                  <p className="text-xs text-muted-foreground truncate">@{r.username}</p>
                </div>
                <div className="text-right">
                  <p className="font-black flex items-center gap-1 justify-end">
                    {tab === "wins" ? <Trophy className="h-3 w-3 text-green-400" /> : <Coins className="h-3 w-3 text-yellow-400" />}
                    {tab === "wins" ? r.wins : r.coins}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{tab === "wins" ? `L: ${r.losses}` : `W: ${r.wins}`}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
