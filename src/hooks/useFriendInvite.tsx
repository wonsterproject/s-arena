import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export type GameType = "ludo" | "chess" | "carrom" | "pool";
// Note: "arena" is not a DB enum value yet, so we route arena via "ludo" placeholder
// (kept for future migration). Pages handle arena separately.

interface Friend {
  id: string;
  username: string;
  display_name: string | null;
  coins: number;
  wins: number;
}

const ROUTE_BY_GAME: Record<GameType, (id: string) => string> = {
  ludo: (id) => `/match/${id}`,
  chess: (id) => `/chess/play?mode=online&id=${id}`,
  carrom: (id) => `/carrom/play?mode=online&id=${id}`,
  pool: (id) => `/pool/play?mode=online&id=${id}`,
};

export function gameRoute(game: GameType, matchId: string) {
  return ROUTE_BY_GAME[game](matchId);
}

export function useFriendInvite(game: GameType) {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setLoadingFriends(true);
    const { data } = await supabase
      .from("friends")
      .select("friend_id, profiles:friend_id ( id, username, display_name, coins, wins )")
      .eq("user_id", user.id);
    const list: Friend[] = ((data ?? []) as any[]).map((r) => r.profiles).filter(Boolean);
    setFriends(list);
    setLoadingFriends(false);
  }, [user]);

  useEffect(() => {
    void loadFriends();
    const ch = supabase
      .channel(`friends-rt-${game}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => loadFriends())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadFriends, game]);

  const invite = useCallback(async (friendId: string, mode: "1v1" | "2v2", bet: number) => {
    if (!user) return;
    if (bet < 50) {
      toast({ title: "Minimum bet is 50 coins", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data: matchId, error } = await supabase.rpc("create_friend_match", {
        _mode: mode,
        _opponent: friendId,
        _bet: bet,
        _game: game,
      });
      if (error || !matchId) throw error ?? new Error("Failed");
      toast({ title: "Invite sent!", description: `${bet} coins locked. Waiting for friend…` });
      await refreshProfile();
      navigate(gameRoute(game, matchId as string));
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }, [user, game, navigate, refreshProfile]);

  return { friends, loadingFriends, creating, invite, profile };
}
