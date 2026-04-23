import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export type GameType = "ludo" | "chess" | "carrom" | "pool" | "arena" | "string_carrom";

interface Friend {
  id: string;
  username: string;
  display_name: string | null;
  coins: number;
  wins: number;
}

const ROUTE_BY_GAME: Record<GameType, (id: string, mode: string) => string> = {
  // Ludo's match page reads mode/id from URL too — pass them as query params.
  ludo: (id, mode) => `/match/${id}?mode=${mode}`,
  chess: (id, mode) => `/chess/play?mode=${mode}&id=${id}`,
  carrom: (id, mode) => `/carrom/play?mode=${mode}&id=${id}`,
  pool: (id, mode) => `/pool/play?mode=${mode}&id=${id}`,
  arena: (id, mode) => `/arena/play?mode=${mode}&id=${id}`,
  string_carrom: (id, mode) => `/string-carrom/play?mode=${mode}&id=${id}`,
};

export function gameRoute(game: GameType, matchId: string, mode: "online" | "bot" = "online") {
  return ROUTE_BY_GAME[game](matchId, mode);
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
        _game: game as any,
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
