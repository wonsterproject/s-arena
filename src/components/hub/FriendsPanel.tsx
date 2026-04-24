import { useEffect, useState } from "react";
import { UserPlus, Search, Loader2, Check, X, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Friend {
  id: string;
  username: string;
  display_name: string | null;
  coins: number;
  wins: number;
}

interface IncomingRequest {
  id: string;
  from_user: string;
  profile: { username: string; display_name: string | null } | null;
}

const initials = (s?: string | null) => (s ?? "?").slice(0, 2).toUpperCase();

export default function FriendsPanel() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void loadAll();
    const ch = supabase
      .channel("hub-friends-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => loadFriends())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadFriends(), loadRequests()]);
    setLoading(false);
  };

  const loadFriends = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friends")
      .select("friend_id, profile:friend_id(id, username, display_name, coins, wins)")
      .eq("user_id", user.id);
    setFriends(((data ?? []) as any[]).map((r) => r.profile).filter(Boolean));
  };

  const loadRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friend_requests")
      .select("id, from_user, profile:from_user(username, display_name)")
      .eq("to_user", user.id)
      .eq("status", "pending");
    setIncoming((data as any) ?? []);
  };

  const doSearch = async () => {
    if (!user || search.trim().length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, coins, wins")
      .ilike("username", `%${search.trim()}%`)
      .neq("id", user.id)
      .limit(8);
    setResults((data as Friend[]) ?? []);
    setSearching(false);
  };

  const sendRequest = async (toId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("friend_requests")
      .insert({ from_user: user.id, to_user: toId, status: "pending" });
    if (error) {
      if (error.code === "23505") toast({ title: "Already requested" });
      else toast({ title: "Could not send", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Friend request sent" });
    }
  };

  const respond = async (id: string, accept: boolean) => {
    const { error } = await supabase
      .from("friend_requests")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: accept ? "Friend added" : "Request declined" });
      void loadAll();
    }
  };

  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Friends
        </h3>
        {incoming.length > 0 && (
          <span className="text-xs font-bold bg-primary/30 px-2 py-0.5 rounded-full">
            {incoming.length} new
          </span>
        )}
      </div>

      {/* Search & add */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Search by username"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary/50 text-sm outline-none border border-border focus:border-primary"
          />
        </div>
        <button
          onClick={doSearch}
          disabled={searching || search.trim().length < 2}
          className="glass-btn h-10 px-4 flex items-center gap-1 text-sm font-bold bg-primary/30 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add
        </button>
      </div>

      {/* Search results */}
      {results.length > 0 && (
        <div className="mb-3 space-y-1.5 max-h-40 overflow-auto">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                {initials(r.username)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">@{r.username}</p>
                <p className="text-xs text-muted-foreground">🏆 {r.wins} · 🪙 {r.coins}</p>
              </div>
              <button
                onClick={() => sendRequest(r.id)}
                className="glass-btn h-8 px-3 text-xs flex items-center gap-1 bg-primary/30"
              >
                <UserPlus className="h-3 w-3" /> Send
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <div className="mb-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Requests</p>
          <div className="space-y-1.5">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                  {initials(r.profile?.username)}
                </div>
                <p className="flex-1 text-sm font-semibold truncate">@{r.profile?.username ?? "?"}</p>
                <button onClick={() => respond(r.id, true)} className="glass-btn h-8 w-8 flex items-center justify-center text-green-400">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => respond(r.id, false)} className="glass-btn h-8 w-8 flex items-center justify-center text-red-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your friends ({friends.length})</p>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
        </div>
      ) : friends.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4">
          No friends yet. Search by username to add some.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-auto">
          {friends.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-xl bg-secondary/40 p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                {initials(f.username)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">@{f.username}</p>
                <p className="text-xs text-muted-foreground">🏆 {f.wins} · 🪙 {f.coins}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
