import { useEffect, useState, useCallback } from "react";
import { Copy, Gift, Lock, Users, Trophy, Loader2, Share2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Stats {
  invited_count: number;
  rewarded_count: number;
  locked_coins: number;
  turnover_remaining: number;
  referral_code: string | null;
  game_id: string | null;
}

const TURNOVER_TOTAL = 25_000;

export default function ReferralCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"code" | "id" | "link" | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_referral_stats");
    if (data && (data as any[]).length) setStats((data as any[])[0]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const copy = async (text: string, kind: "code" | "id" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
      toast({ title: "Copied!" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (loading || !stats) {
    return (
      <section className="glass rounded-3xl p-5 ring-1 ring-white/10 flex items-center justify-center min-h-[180px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const inviteLink = stats.referral_code
    ? `${window.location.origin}/signup?ref=${stats.referral_code}`
    : "";
  const turnoverDone = stats.locked_coins > 0
    ? Math.max(0, TURNOVER_TOTAL - stats.turnover_remaining)
    : 0;
  const pct = stats.locked_coins > 0
    ? Math.min(100, (turnoverDone / TURNOVER_TOTAL) * 100)
    : 0;

  return (
    <section className="glass rounded-3xl p-5 ring-1 ring-primary/30 bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
      <header className="flex items-center gap-2 mb-4">
        <Gift className="h-5 w-5 text-primary" />
        <h3 className="font-black text-lg">Your Game ID & Referral</h3>
      </header>

      {/* IDs */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => stats.game_id && copy(stats.game_id, "id")}
          className="glass-btn p-3 text-left flex flex-col items-start hover:scale-[1.02] transition-transform"
        >
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Game ID</span>
          <div className="flex items-center gap-1.5 mt-1 w-full">
            <span className="font-black text-lg font-mono tracking-wider">{stats.game_id ?? "—"}</span>
            {copied === "id" ? <Check className="h-3.5 w-3.5 text-emerald-400 ml-auto" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
          </div>
        </button>
        <button
          onClick={() => stats.referral_code && copy(stats.referral_code, "code")}
          className="glass-btn p-3 text-left flex flex-col items-start hover:scale-[1.02] transition-transform"
        >
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Referral Code</span>
          <div className="flex items-center gap-1.5 mt-1 w-full">
            <span className="font-black text-lg font-mono tracking-wider text-primary">{stats.referral_code ?? "—"}</span>
            {copied === "code" ? <Check className="h-3.5 w-3.5 text-emerald-400 ml-auto" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
          </div>
        </button>
      </div>

      {/* Share link */}
      {inviteLink && (
        <button
          onClick={() => copy(inviteLink, "link")}
          className="w-full glass-btn h-10 mb-4 flex items-center justify-center gap-2 text-sm font-bold bg-gradient-to-r from-primary/30 to-accent/30 hover:from-primary/50 hover:to-accent/50"
        >
          {copied === "link" ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
          {copied === "link" ? "Link copied!" : "Copy invite link"}
        </button>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={<Users className="h-3.5 w-3.5" />} label="Invited" value={stats.invited_count} />
        <Stat icon={<Trophy className="h-3.5 w-3.5" />} label="Rewarded" value={stats.rewarded_count} />
        <Stat icon={<Lock className="h-3.5 w-3.5" />} label="Locked" value={stats.locked_coins} accent />
      </div>

      {/* Locked / turnover bar */}
      {stats.locked_coins > 0 ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-300 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Unlock progress
            </span>
            <span className="text-amber-200 font-mono">
              {turnoverDone.toLocaleString()} / {TURNOVER_TOTAL.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-amber-900/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-amber-200/80 leading-relaxed">
            Play & bet in matches to complete <strong>{stats.turnover_remaining.toLocaleString()}</strong> more coins of turnover and unlock your bonus for withdrawal.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-primary">Earn 500 coins</strong> per friend! Bonus is awarded after they buy 1000+ coins. Bonus unlocks after you complete 25,000 coins of betting turnover.
        </p>
      )}
    </section>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-2 text-center ${accent ? "bg-amber-500/15 border border-amber-500/30" : "bg-secondary/30"}`}>
      <div className={`flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest ${accent ? "text-amber-300" : "text-muted-foreground"}`}>
        {icon} {label}
      </div>
      <div className={`font-black text-lg ${accent ? "text-amber-300" : ""}`}>{value}</div>
    </div>
  );
}
