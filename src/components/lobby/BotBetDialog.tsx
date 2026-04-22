import { useState } from "react";
import { Coins, X, Loader2, Bot } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  game: "ludo" | "chess" | "carrom" | "pool" | "arena";
  difficulty: "medium" | "hard";
  /** Called with the new match id and chosen bet on success */
  onCreated: (matchId: string, bet: number) => void;
}

const PRESETS = [50, 100, 250, 500, 1000];

export default function BotBetDialog({ open, onClose, game, difficulty, onCreated }: Props) {
  const { profile, refreshProfile } = useAuth();
  const [bet, setBet] = useState<number>(50);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const balance = profile?.coins ?? 0;
  const canAfford = balance >= bet && bet >= 50;

  const handleStart = async () => {
    if (!canAfford || loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_paid_bot_match", { _game: game, _bet: bet });
      if (error || !data) throw error ?? new Error("Failed to create match");
      await refreshProfile();
      toast({ title: `Bet locked: 🪙 ${bet}`, description: `Win to earn 🪙 ${bet * 2}` });
      onCreated(data as string, bet);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass rounded-3xl p-6 max-w-sm w-full neon-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase">{difficulty} Bot · Bet</h2>
              <p className="text-xs text-muted-foreground">Win to earn 2× your bet</p>
            </div>
          </div>
          <button onClick={onClose} className="glass-btn h-8 w-8 !p-0 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl bg-secondary/40 p-3 mb-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Balance</span>
          <span className="font-bold text-yellow-400 flex items-center gap-1">
            <Coins className="h-4 w-4" /> {balance}
          </span>
        </div>

        <div className="mb-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Bet amount (min 50)</p>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setBet(p)}
                className={`glass-btn h-10 text-sm font-bold transition-all ${
                  bet === p ? "bg-primary/40 ring-2 ring-primary" : ""
                } ${p > balance ? "opacity-40" : ""}`}
                disabled={p > balance}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={50}
            max={balance}
            value={bet}
            onChange={(e) => setBet(Math.max(50, Math.min(balance, parseInt(e.target.value || "50", 10))))}
            className="w-full h-11 px-3 rounded-xl bg-secondary/50 border border-border/40 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 mb-4 text-center">
          <p className="text-xs text-muted-foreground">Potential win</p>
          <p className="text-2xl font-black text-yellow-400 flex items-center justify-center gap-1">
            <Coins className="h-5 w-5" /> {bet * 2}
          </p>
        </div>

        <button
          onClick={handleStart}
          disabled={!canAfford || loading}
          className="glass-btn w-full h-12 bg-gradient-to-r from-primary/40 to-accent/40 font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Start Match · Bet 🪙 {bet}</>}
        </button>
        {!canAfford && bet > balance && (
          <p className="text-xs text-red-400 text-center mt-2">Not enough coins</p>
        )}
      </div>
    </div>
  );
}
