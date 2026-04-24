import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Swords, Check, Loader2, Coins, Dice5, Crown, Circle, Target, Crosshair, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { gameRoute, type GameType } from "@/hooks/useFriendInvite";

interface MatchInvite {
  id: string;
  match_id: string;
  from_user: string;
  mode: "1v1" | "2v2" | string;
  game_type: GameType;
  bet_amount: number;
  created_at: string;
  profile: { username: string; display_name: string | null } | null;
}

const INVITE_TTL_MS = 50_000;

const GAME_META: Record<GameType, { label: string; icon: React.ReactNode }> = {
  ludo: { label: "Ludo", icon: <Dice5 className="h-4 w-4" /> },
  chess: { label: "Chess", icon: <Crown className="h-4 w-4" /> },
  carrom: { label: "Carrom", icon: <Circle className="h-4 w-4" /> },
  pool: { label: "Pool", icon: <Target className="h-4 w-4" /> },
  arena: { label: "Arena", icon: <Crosshair className="h-4 w-4" /> },
  string_carrom: { label: "Sling", icon: <Zap className="h-4 w-4" /> },
};

export default function MatchInvitesPanel() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<MatchInvite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("match_invites")
      .select(
        "id, match_id, from_user, mode, status, created_at, profile:from_user ( username, display_name ), match:matches!match_invites_match_id_fkey ( game_type, bet_amount )"
      )
      .eq("to_user", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const cutoff = Date.now() - INVITE_TTL_MS;
    const mapped: MatchInvite[] = ((data ?? []) as any[])
      .filter((r) => new Date(r.created_at).getTime() >= cutoff)
      .map((r) => ({
        id: r.id,
        match_id: r.match_id,
        from_user: r.from_user,
        mode: r.mode,
        profile: r.profile,
        created_at: r.created_at,
        game_type: (r.match?.game_type ?? "ludo") as GameType,
        bet_amount: r.match?.bet_amount ?? 0,
      }));
    setInvites(mapped);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`hub-invites-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_invites", filter: `to_user=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    // Re-evaluate every second so invites disappear right at the 50-second mark
    const tick = setInterval(() => {
      setInvites((prev) => {
        const cutoff = Date.now() - INVITE_TTL_MS;
        const next = prev.filter((i) => new Date(i.created_at).getTime() >= cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => {
      void supabase.removeChannel(ch);
      clearInterval(tick);
    };
  }, [user?.id, load]);

  const accept = async (inv: MatchInvite) => {
    if (busyId) return;
    setBusyId(inv.id);
    try {
      const { data: matchId, error } = await supabase.rpc("accept_match_invite", { _invite_id: inv.id });
      if (error || !matchId) throw error ?? new Error("Failed");
      await refreshProfile();
      navigate(gameRoute(inv.game_type, matchId as string, "online"));
    } catch (err: any) {
      toast({ title: "Failed to accept", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  // Compute remaining seconds for each invite (50s TTL)
  const remaining = (inv: MatchInvite) =>
    Math.max(0, Math.ceil((INVITE_TTL_MS - (Date.now() - new Date(inv.created_at).getTime())) / 1000));

  if (invites.length === 0) return null;

  return (
    <div className="glass rounded-3xl p-5 mb-4 border border-primary/40 ring-2 ring-primary/30 animate-pulse-slow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-black flex items-center gap-2">
          <Swords className="h-5 w-5 text-primary" /> Match Challenges
        </h3>
        <span className="text-xs font-bold bg-primary/30 px-2 py-0.5 rounded-full">
          {invites.length} new
        </span>
      </div>
      <div className="space-y-2">
        {invites.map((inv) => {
          const meta = GAME_META[inv.game_type] ?? GAME_META.ludo;
          const name = inv.profile?.display_name || inv.profile?.username || "Player";
          return (
            <div key={inv.id} className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40">
                {meta.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  <span className="text-primary">@{inv.profile?.username ?? "?"}</span> challenged you
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>{meta.label} · {inv.mode}</span>
                  {inv.bet_amount > 0 && (
                    <span className="flex items-center gap-1">
                      <Coins className="h-3 w-3 text-yellow-400" /> {inv.bet_amount}
                    </span>
                  )}
                  <span className="ml-auto font-bold text-yellow-300">{remaining(inv)}s</span>
                </p>
              </div>
              <button
                onClick={() => accept(inv)}
                disabled={busyId === inv.id}
                className="glass-btn h-9 px-3 flex items-center gap-1 text-emerald-400 disabled:opacity-50 font-bold"
                title="Accept"
              >
                {busyId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Accept</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
