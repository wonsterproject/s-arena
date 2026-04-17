import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut, Settings, Coins, Trophy, UserPlus, Users, Bot, Shuffle, Swords,
  Check, X, Search, Loader2, Send, Crown, ShoppingBag, User, ShieldCheck
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import BetDialog from "@/components/lobby/BetDialog";

type MatchMode = "bot" | "1v1" | "2v2" | "1v2" | "custom" | "random";

interface Friend {
  id: string;
  username: string;
  display_name: string | null;
  coins: number;
  wins: number;
}

interface FriendRequest {
  id: string;
  from_user: string;
  to_user: string;
  status: string;
  profile: { username: string; display_name: string | null } | null;
}

interface MatchInvite {
  id: string;
  match_id: string;
  from_user: string;
  to_user: string;
  mode: MatchMode;
  status: string;
  profile?: { username: string };
}

export default function Lobby() {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [invites, setInvites] = useState<MatchInvite[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"play" | "friends">("play");
  const [creating, setCreating] = useState(false);
  const [betDialog, setBetDialog] = useState<{ friend: Friend; mode: "1v1" | "2v2" } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    void loadAll();
    const ch = supabase
      .channel("lobby-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, () => loadRequests())
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => loadFriends())
      .on("postgres_changes", { event: "*", schema: "public", table: "match_invites" }, () => loadInvites())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadAll = async () => {
    await Promise.all([loadFriends(), loadRequests(), loadInvites(), refreshProfile()]);
  };

  const loadFriends = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("friends")
      .select("friend_id, profiles:friend_id ( id, username, display_name, coins, wins )")
      .eq("user_id", user.id);
    const list: Friend[] = (data ?? []).map((r: any) => r.profiles).filter(Boolean);
    setFriends(list);
  };

  const loadRequests = async () => {
    if (!user) return;
    const { data: inc } = await supabase
      .from("friend_requests")
      .select("id, from_user, to_user, status, profile:from_user ( username, display_name )")
      .eq("to_user", user.id)
      .eq("status", "pending");
    setIncoming((inc as any) ?? []);
    const { data: out } = await supabase
      .from("friend_requests")
      .select("id, from_user, to_user, status, profile:to_user ( username, display_name )")
      .eq("from_user", user.id)
      .eq("status", "pending");
    setOutgoing((out as any) ?? []);
  };

  const loadInvites = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("match_invites")
      .select("id, match_id, from_user, to_user, mode, status, profile:from_user ( username )")
      .eq("to_user", user.id)
      .eq("status", "pending");
    setInvites((data as any) ?? []);
  };

  const doSearch = async () => {
    if (!user || search.trim().length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, coins, wins")
      .ilike("username", `%${search.trim()}%`)
      .neq("id", user.id)
      .limit(10);
    setSearchResults((data as Friend[]) ?? []);
    setSearching(false);
  };

  const sendFriendRequest = async (toId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("friend_requests")
      .insert({ from_user: user.id, to_user: toId, status: "pending" });
    if (error) {
      if (error.code === "23505") toast({ title: "Already requested" });
      else toast({ title: "Could not send", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Friend request sent" });
      loadRequests();
    }
  };

  const respondRequest = async (id: string, accept: boolean) => {
    const { error } = await supabase
      .from("friend_requests")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: accept ? "Friend added" : "Request declined" });
      loadAll();
    }
  };

  const startBotMatch = async () => {
    if (!user || !profile) return;
    setCreating(true);
    try {
      const { data: matchId, error } = await supabase.rpc("create_bot_match");
      if (error || !matchId) throw error ?? new Error("No match id returned");
      navigate(`/match/${matchId}`);
    } catch (err: any) {
      toast({ title: "Failed to start", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const startRandomMatch = async (mode: "1v1" | "2v2" | "random") => {
    if (!user) return;
    setCreating(true);
    try {
      const { data: matchId, error } = await supabase.rpc("join_or_create_match", { _mode: mode });
      if (error) throw error;
      if (matchId) {
        navigate(`/match/${matchId}`);
      } else {
        toast({ title: "Searching for opponents...", description: "You'll be matched when more players join." });
        const ch = supabase
          .channel(`mm-${user.id}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_players", filter: `user_id=eq.${user.id}` },
            (payload) => {
              const mid = (payload.new as any).match_id;
              supabase.removeChannel(ch);
              navigate(`/match/${mid}`);
            })
          .subscribe();
        setTimeout(() => supabase.removeChannel(ch), 60000);
      }
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const inviteFriend = async (friendId: string, mode: "1v1" | "2v2", bet: number) => {
    if (!user) return;
    setCreating(true);
    try {
      const { data: matchId, error } = await supabase.rpc("create_friend_match", { _mode: mode, _opponent: friendId, _bet: bet });
      if (error || !matchId) throw error ?? new Error("Failed");
      toast({ title: "Invite sent! Waiting for friend...", description: bet > 0 ? `${bet} coins locked` : undefined });
      await refreshProfile();
      navigate(`/match/${matchId}`);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const acceptInvite = async (inviteId: string) => {
    setCreating(true);
    try {
      const { data: matchId, error } = await supabase.rpc("accept_match_invite", { _invite_id: inviteId });
      if (error || !matchId) throw error ?? new Error("Failed");
      navigate(`/match/${matchId}`);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const declineInvite = async (inviteId: string) => {
    await supabase.from("match_invites").update({ status: "declined" }).eq("id", inviteId);
    loadInvites();
  };

  const initials = (s?: string | null) => (s ?? "?").slice(0, 2).toUpperCase();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <LobbyAnimatedBg />

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
            <Crown className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black text-glow leading-tight">LUDO ARENA</h1>
            <p className="text-xs text-muted-foreground">Lobby</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/leaderboard")} className="glass-btn h-10 w-10 !p-0 flex items-center justify-center" aria-label="Leaderboard">
            <Trophy className="h-4 w-4" />
          </button>
          <button onClick={() => navigate("/shop")} className="glass-btn h-10 w-10 !p-0 flex items-center justify-center" aria-label="Shop">
            <ShoppingBag className="h-4 w-4" />
          </button>
          <button onClick={() => navigate("/profile")} className="glass-btn h-10 w-10 !p-0 flex items-center justify-center" aria-label="Profile">
            <User className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button onClick={() => navigate("/admin")} className="glass-btn h-10 w-10 !p-0 flex items-center justify-center text-primary" aria-label="Admin">
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          <button onClick={async () => { await signOut(); navigate("/login"); }} className="glass-btn h-10 flex items-center gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline text-sm">Logout</span>
          </button>
        </div>
      </header>

      {/* Profile card */}
      <section className="relative z-10 mx-auto max-w-6xl px-4">
        <div className="glass rounded-3xl p-5 neon-border flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/40 to-accent/40 text-xl font-black">
              {initials(profile?.username)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Welcome back</p>
              <h2 className="text-xl font-black truncate">{profile?.display_name ?? profile?.username ?? "Player"}</h2>
              <p className="text-xs text-muted-foreground">@{profile?.username}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Stat icon={<Coins className="h-4 w-4" />} label="Coins" value={profile?.coins ?? 0} color="hsl(var(--yellow))" />
            <Stat icon={<Trophy className="h-4 w-4" />} label="Wins" value={profile?.wins ?? 0} color="hsl(var(--green))" />
            <Stat icon={<Swords className="h-4 w-4" />} label="Losses" value={profile?.losses ?? 0} color="hsl(var(--red))" />
          </div>
        </div>
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="relative z-10 mx-auto max-w-6xl px-4 mt-4">
          <div className="glass rounded-2xl p-4 border border-primary/40">
            <p className="text-xs uppercase tracking-widest text-primary mb-2">Match invites</p>
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2 py-2 border-t border-border/40 first:border-t-0">
                <p className="text-sm flex-1 min-w-0 truncate">
                  <strong>@{inv.profile?.username ?? "someone"}</strong> invited you to <span className="text-primary">{inv.mode}</span>
                </p>
                <button onClick={() => acceptInvite(inv.id)} disabled={creating} className="glass-btn h-8 text-xs bg-green-500/30 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Accept
                </button>
                <button onClick={() => declineInvite(inv.id)} className="glass-btn h-8 !px-2 text-xs text-red-400">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tabs */}
      <section className="relative z-10 mx-auto max-w-6xl px-4 mt-6">
        <div className="flex gap-2 mb-4">
          <TabBtn active={tab === "play"} onClick={() => setTab("play")} icon={<Swords className="h-4 w-4" />} label="Play" />
          <TabBtn active={tab === "friends"} onClick={() => setTab("friends")} icon={<Users className="h-4 w-4" />} label={`Friends${friends.length ? ` (${friends.length})` : ""}`} />
        </div>

        {tab === "play" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ModeCard
              title="Play vs Bots"
              desc="3 AI opponents. Practice and warm up."
              icon={<Bot className="h-6 w-6" />}
              gradient="from-green-500/30 to-emerald-500/20"
              loading={creating}
              onClick={startBotMatch}
            />
            <ModeCard
              title="Random 1v1"
              desc="Auto-match with an online player."
              icon={<Shuffle className="h-6 w-6" />}
              gradient="from-blue-500/30 to-cyan-500/20"
              loading={creating}
              onClick={() => startRandomMatch("1v1")}
            />
            <ModeCard
              title="1 vs 1 (Friend)"
              desc="Open Friends tab and tap Invite."
              icon={<Swords className="h-6 w-6" />}
              gradient="from-rose-500/30 to-pink-500/20"
              onClick={() => setTab("friends")}
            />
            <ModeCard
              title="2 vs 2 (Friends)"
              desc="Open Friends tab and tap Invite."
              icon={<Users className="h-6 w-6" />}
              gradient="from-purple-500/30 to-fuchsia-500/20"
              onClick={() => setTab("friends")}
            />
            <ModeCard
              title="Random 2v2"
              desc="Auto-match into a 4-player team game."
              icon={<Crown className="h-6 w-6" />}
              gradient="from-amber-500/30 to-orange-500/20"
              loading={creating}
              onClick={() => startRandomMatch("2v2")}
            />
            <ModeCard
              title="Quick Random"
              desc="Any open match, fastest queue."
              icon={<Settings className="h-6 w-6" />}
              gradient="from-violet-500/30 to-indigo-500/20"
              loading={creating}
              onClick={() => startRandomMatch("random")}
            />
          </div>
        )}

        {tab === "friends" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="glass rounded-2xl p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add Friend</h3>
              <div className="flex gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="Search by username"
                  className="bg-secondary/50"
                />
                <button onClick={doSearch} className="glass-btn h-10 !px-3 flex items-center" aria-label="Search">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-3 space-y-2 max-h-64 overflow-auto">
                {searchResults.map((u) => {
                  const isFriend = friends.some((f) => f.id === u.id);
                  const requested = outgoing.some((r: any) => r.to_user === u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                        {initials(u.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">@{u.username}</p>
                        <p className="text-xs text-muted-foreground">🏆 {u.wins} · 🪙 {u.coins}</p>
                      </div>
                      {isFriend ? (
                        <span className="text-xs text-muted-foreground">Friends</span>
                      ) : requested ? (
                        <span className="text-xs text-muted-foreground">Requested</span>
                      ) : (
                        <button onClick={() => sendFriendRequest(u.id)} className="glass-btn h-8 text-xs flex items-center gap-1">
                          <Send className="h-3 w-3" /> Add
                        </button>
                      )}
                    </div>
                  );
                })}
                {!searching && searchResults.length === 0 && search.length >= 2 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No users found</p>
                )}
              </div>

              {incoming.length > 0 && (
                <>
                  <h4 className="font-bold mt-5 mb-2 text-sm">Incoming requests</h4>
                  <div className="space-y-2">
                    {incoming.map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                          {initials(r.profile?.username)}
                        </div>
                        <p className="flex-1 text-sm truncate">@{r.profile?.username}</p>
                        <button onClick={() => respondRequest(r.id, true)} className="glass-btn h-8 !px-2 text-xs flex items-center gap-1 text-green-400"><Check className="h-3 w-3" /></button>
                        <button onClick={() => respondRequest(r.id, false)} className="glass-btn h-8 !px-2 text-xs flex items-center gap-1 text-red-400"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="glass rounded-2xl p-4">
              <h3 className="font-bold mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Your Friends</h3>
              {friends.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No friends yet. Add some to play together!</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {friends.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 p-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/40 to-accent/40 text-xs font-bold">
                        {initials(f.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">@{f.username}</p>
                        <p className="text-xs text-muted-foreground">🏆 {f.wins} · 🪙 {f.coins}</p>
                      </div>
                      <button onClick={() => setBetDialog({ friend: f, mode: "1v1" })} disabled={creating} className="glass-btn h-8 text-xs flex items-center gap-1 bg-primary/30">
                        <Swords className="h-3 w-3" /> 1v1
                      </button>
                      <button onClick={() => setBetDialog({ friend: f, mode: "2v2" })} disabled={creating} className="glass-btn h-8 text-xs flex items-center gap-1">
                        <Users className="h-3 w-3" /> 2v2
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="h-10" />
    </main>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3 text-center min-w-[70px]">
      <div className="flex items-center justify-center gap-1" style={{ color }}>{icon}<span className="text-lg font-black">{value}</span></div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`glass-btn flex items-center gap-2 text-sm ${active ? "bg-gradient-to-r from-primary/40 to-accent/40 !text-foreground" : "opacity-70"}`}
    >
      {icon}{label}
    </button>
  );
}

function ModeCard({ title, desc, icon, gradient, onClick, loading }: {
  title: string; desc: string; icon: React.ReactNode; gradient: string; onClick: () => void; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`glass relative overflow-hidden rounded-2xl p-5 text-left transition-all hover:scale-[1.02] hover:neon-border bg-gradient-to-br ${gradient} disabled:opacity-60`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/40 backdrop-blur">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : icon}
        </div>
      </div>
      <h3 className="font-black text-lg">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
    </button>
  );
}

function LobbyAnimatedBg() {
  const colors = ["hsl(var(--red))", "hsl(var(--blue))", "hsl(var(--green))", "hsl(var(--yellow))"];
  const tokens = useMemo(() => Array.from({ length: 18 }).map((_, i) => ({
    color: colors[i % 4],
    size: 24 + (i % 6) * 8,
    left: (i * 53) % 100,
    delay: (i % 9) * 0.6,
    duration: 11 + (i % 6) * 2,
  })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      {tokens.map((t, i) => (
        <span
          key={i}
          className="absolute rounded-full animate-float-token"
          style={{
            left: `${t.left}%`,
            top: "-10%",
            width: t.size,
            height: t.size,
            background: `radial-gradient(circle at 30% 25%, hsl(0 0% 100% / 0.7), ${t.color} 60%)`,
            boxShadow: `0 0 24px ${t.color}, inset 0 0 0 2px hsl(0 0% 100% / 0.25)`,
            animationDelay: `${t.delay}s`,
            animationDuration: `${t.duration}s`,
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  );
}
