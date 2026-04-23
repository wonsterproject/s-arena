import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Save, ShieldCheck, ShieldOff, Gift, ArrowLeft, Coins, Trophy, Swords, Wallet, Users, UserCog, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PaymentRequestsPanel from "@/components/admin/PaymentRequestsPanel";

interface PlayerRow {
  id: string;
  username: string;
  display_name: string | null;
  coins: number;
  wins: number;
  losses: number;
  is_admin?: boolean;
}

interface FakeUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  game_id: string;
  coins: number;
  wins: number;
  losses: number;
}

interface ShopItem {
  id: string;
  name: string;
  price_coins: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [fakes, setFakes] = useState<FakeUserRow[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [fakeSearch, setFakeSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, Partial<PlayerRow>>>({});
  const [editingFake, setEditingFake] = useState<Record<string, Partial<FakeUserRow>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [grantTarget, setGrantTarget] = useState<string | null>(null);
  const [tab, setTab] = useState<"players" | "fakes" | "payments">("players");
  const [pendingCount, setPendingCount] = useState(0);
  void adminIds;

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!isAdmin) {
      toast({ title: "Access denied", description: "Admins only", variant: "destructive" });
      navigate("/admin/login", { replace: true });
      return;
    }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, authLoading, roleLoading]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: profs }, { data: roles }, { data: items }, { count }, { data: fakeData }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, coins, wins, losses").order("coins", { ascending: false }).limit(500),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("shop_items").select("id, name, price_coins").order("price_coins"),
      supabase.from("payment_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("fake_users" as never).select("id, username, display_name, avatar_url, game_id, coins, wins, losses").order("display_name").limit(500),
    ]);
    const adminSet = new Set<string>(((roles ?? []) as { user_id: string }[]).map((r) => r.user_id));
    setAdminIds(adminSet);
    setPlayers(((profs ?? []) as PlayerRow[]).map((p) => ({ ...p, is_admin: adminSet.has(p.id) })));
    setShopItems((items ?? []) as ShopItem[]);
    setPendingCount(count ?? 0);
    setFakes((fakeData ?? []) as FakeUserRow[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) => p.username.toLowerCase().includes(q) || (p.display_name ?? "").toLowerCase().includes(q),
    );
  }, [players, search]);

  const filteredFakes = useMemo(() => {
    const q = fakeSearch.trim().toLowerCase();
    if (!q) return fakes;
    return fakes.filter(
      (f) => f.username.toLowerCase().includes(q) || f.display_name.toLowerCase().includes(q) || f.game_id.includes(q),
    );
  }, [fakes, fakeSearch]);

  const setField = (id: string, field: keyof PlayerRow, value: string | number) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };
  const setFakeField = (id: string, field: keyof FakeUserRow, value: string | number) => {
    setEditingFake((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getValue = (p: PlayerRow, field: keyof PlayerRow) => {
    const e = editing[p.id];
    return (e && e[field] !== undefined ? e[field] : p[field]) as string | number;
  };
  const getFakeValue = <K extends keyof FakeUserRow>(f: FakeUserRow, field: K): FakeUserRow[K] => {
    const e = editingFake[f.id];
    return (e && e[field] !== undefined ? (e[field] as FakeUserRow[K]) : f[field]);
  };

  const isDirty = (id: string) => !!editing[id] && Object.keys(editing[id]).length > 0;
  const isFakeDirty = (id: string) => !!editingFake[id] && Object.keys(editingFake[id]).length > 0;

  const save = async (p: PlayerRow) => {
    const e = editing[p.id];
    if (!e) return;
    setSavingId(p.id);
    const { error } = await supabase.rpc("admin_update_profile", {
      _user_id: p.id,
      _coins: e.coins !== undefined ? Number(e.coins) : undefined,
      _wins: e.wins !== undefined ? Number(e.wins) : undefined,
      _losses: e.losses !== undefined ? Number(e.losses) : undefined,
      _display_name: e.display_name !== undefined ? String(e.display_name) : undefined,
      _username: e.username !== undefined ? String(e.username) : undefined,
    });
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `Updated ${p.username}` });
    setEditing((prev) => {
      const cp = { ...prev };
      delete cp[p.id];
      return cp;
    });
    void loadAll();
  };

  const saveFake = async (f: FakeUserRow) => {
    const e = editingFake[f.id];
    if (!e) return;
    setSavingId(f.id);
    const patch: Partial<FakeUserRow> = {};
    if (e.display_name !== undefined) patch.display_name = String(e.display_name);
    if (e.username !== undefined) patch.username = String(e.username);
    if (e.avatar_url !== undefined) patch.avatar_url = String(e.avatar_url);
    if (e.coins !== undefined) patch.coins = Number(e.coins);
    if (e.wins !== undefined) patch.wins = Number(e.wins);
    if (e.losses !== undefined) patch.losses = Number(e.losses);
    const { error } = await supabase.from("fake_users" as never).update(patch as never).eq("id", f.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `Updated ${f.display_name}` });
    setEditingFake((prev) => {
      const cp = { ...prev };
      delete cp[f.id];
      return cp;
    });
    void loadAll();
  };

  const uploadFakeAvatar = async (f: FakeUserRow, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 2MB", variant: "destructive" });
      return;
    }
    setUploadingId(f.id);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `fake/${f.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });
    if (upErr) {
      setUploadingId(null);
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await supabase.from("fake_users" as never).update({ avatar_url: url } as never).eq("id", f.id);
    setUploadingId(null);
    if (updErr) {
      toast({ title: "Save failed", description: updErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Avatar updated", description: f.display_name });
    void loadAll();
  };

    const grant = !p.is_admin;
    const { error } = await supabase.rpc("admin_set_role", {
      _user_id: p.id,
      _role: "admin",
      _grant: grant,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: grant ? "Admin granted" : "Admin revoked", description: p.username });
    void loadAll();
  };

  const grantItem = async (userId: string, itemId: string) => {
    const { error } = await supabase.rpc("admin_grant_item", { _user_id: userId, _item_id: itemId });
    if (error) {
      toast({ title: "Grant failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Item granted" });
    setGrantTarget(null);
  };

  if (authLoading || roleLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <header className="relative z-10 mx-auto max-w-6xl flex items-center justify-between mb-6">
        <button onClick={() => navigate("/lobby")} className="glass-btn flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Lobby
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-black tracking-tight">ADMIN PANEL</h1>
        </div>
        <div className="w-24" />
      </header>

      <div className="mx-auto max-w-6xl flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTab("players")}
          className={`glass-btn h-10 px-4 flex items-center gap-2 text-sm ${tab === "players" ? "bg-gradient-to-r from-primary/40 to-accent/40" : ""}`}
        >
          <Users className="h-4 w-4" /> Real Players ({players.length})
        </button>
        <button
          onClick={() => setTab("fakes")}
          className={`glass-btn h-10 px-4 flex items-center gap-2 text-sm ${tab === "fakes" ? "bg-gradient-to-r from-primary/40 to-accent/40" : ""}`}
        >
          <UserCog className="h-4 w-4" /> Fake Users ({fakes.length})
        </button>
        <button
          onClick={() => setTab("payments")}
          className={`glass-btn h-10 px-4 flex items-center gap-2 text-sm ${tab === "payments" ? "bg-gradient-to-r from-primary/40 to-accent/40" : ""}`}
        >
          <Wallet className="h-4 w-4" /> Payments
          {pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-yellow-500/30 text-yellow-300 text-[10px] font-black px-2 py-0.5">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {tab === "payments" && (
        <section className="mx-auto max-w-6xl">
          <PaymentRequestsPanel />
        </section>
      )}

      {tab === "fakes" && (
        <section className="mx-auto max-w-6xl glass rounded-3xl p-4 neon-border">
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search fake users by name or game ID..."
              value={fakeSearch}
              onChange={(e) => setFakeSearch(e.target.value)}
              className="bg-secondary/50"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{filteredFakes.length} fake users</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="py-2 pr-2">Avatar</th>
                  <th className="py-2 pr-2">Display name</th>
                  <th className="py-2 pr-2">Username</th>
                  <th className="py-2 pr-2">Game ID</th>
                  <th className="py-2 pr-2"><Coins className="inline h-3 w-3" /> Coins</th>
                  <th className="py-2 pr-2"><Trophy className="inline h-3 w-3" /> Wins</th>
                  <th className="py-2 pr-2"><Swords className="inline h-3 w-3" /> Losses</th>
                  <th className="py-2 pr-2">Avatar URL</th>
                  <th className="py-2 pr-2">Save</th>
                </tr>
              </thead>
              <tbody>
                {filteredFakes.map((f) => (
                  <tr key={f.id} className="border-b border-border/20 hover:bg-secondary/20">
                    <td className="py-2 pr-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={getFakeValue(f, "avatar_url")} alt={f.display_name} />
                        <AvatarFallback>{f.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={getFakeValue(f, "display_name") ?? ""}
                        onChange={(e) => setFakeField(f.id, "display_name", e.target.value)}
                        className="h-8 bg-secondary/40 min-w-[120px]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={getFakeValue(f, "username") ?? ""}
                        onChange={(e) => setFakeField(f.id, "username", e.target.value)}
                        className="h-8 bg-secondary/40 min-w-[140px]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <span className="text-xs font-mono text-muted-foreground">{f.game_id}</span>
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        value={getFakeValue(f, "coins") ?? 0}
                        onChange={(e) => setFakeField(f.id, "coins", Number(e.target.value))}
                        className="h-8 bg-secondary/40 w-24"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        value={getFakeValue(f, "wins") ?? 0}
                        onChange={(e) => setFakeField(f.id, "wins", Number(e.target.value))}
                        className="h-8 bg-secondary/40 w-20"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        value={getFakeValue(f, "losses") ?? 0}
                        onChange={(e) => setFakeField(f.id, "losses", Number(e.target.value))}
                        className="h-8 bg-secondary/40 w-20"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={getFakeValue(f, "avatar_url") ?? ""}
                        onChange={(e) => setFakeField(f.id, "avatar_url", e.target.value)}
                        className="h-8 bg-secondary/40 min-w-[200px] text-xs"
                        placeholder="https://..."
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <button
                        disabled={!isFakeDirty(f.id) || savingId === f.id}
                        onClick={() => saveFake(f)}
                        className="glass-btn h-8 px-2 text-xs flex items-center gap-1 bg-gradient-to-r from-primary/30 to-accent/30 disabled:opacity-40"
                      >
                        {savingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredFakes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">No fake users</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "players" && (
      <section className="mx-auto max-w-6xl glass rounded-3xl p-4 neon-border">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by username or display name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-secondary/50"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} players</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="py-2 pr-2">Username</th>
                <th className="py-2 pr-2">Display name</th>
                <th className="py-2 pr-2"><Coins className="inline h-3 w-3" /> Coins</th>
                <th className="py-2 pr-2"><Trophy className="inline h-3 w-3" /> Wins</th>
                <th className="py-2 pr-2"><Swords className="inline h-3 w-3" /> Losses</th>
                <th className="py-2 pr-2">Admin</th>
                <th className="py-2 pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/20 hover:bg-secondary/20">
                  <td className="py-2 pr-2">
                    <Input
                      value={getValue(p, "username") ?? ""}
                      onChange={(e) => setField(p.id, "username", e.target.value)}
                      className="h-8 bg-secondary/40 min-w-[120px]"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      value={getValue(p, "display_name") ?? ""}
                      onChange={(e) => setField(p.id, "display_name", e.target.value)}
                      className="h-8 bg-secondary/40 min-w-[120px]"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      value={getValue(p, "coins") ?? 0}
                      onChange={(e) => setField(p.id, "coins", Number(e.target.value))}
                      className="h-8 bg-secondary/40 w-24"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      value={getValue(p, "wins") ?? 0}
                      onChange={(e) => setField(p.id, "wins", Number(e.target.value))}
                      className="h-8 bg-secondary/40 w-20"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number"
                      value={getValue(p, "losses") ?? 0}
                      onChange={(e) => setField(p.id, "losses", Number(e.target.value))}
                      className="h-8 bg-secondary/40 w-20"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <button
                      onClick={() => toggleAdmin(p)}
                      className={`glass-btn h-8 px-2 text-xs flex items-center gap-1 ${p.is_admin ? "text-primary" : "text-muted-foreground"}`}
                      title={p.is_admin ? "Revoke admin" : "Grant admin"}
                    >
                      {p.is_admin ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                      {p.is_admin ? "Yes" : "No"}
                    </button>
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      <button
                        disabled={!isDirty(p.id) || savingId === p.id}
                        onClick={() => save(p)}
                        className="glass-btn h-8 px-2 text-xs flex items-center gap-1 bg-gradient-to-r from-primary/30 to-accent/30 disabled:opacity-40"
                      >
                        {savingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Save
                      </button>
                      <button
                        onClick={() => setGrantTarget(grantTarget === p.id ? null : p.id)}
                        className="glass-btn h-8 px-2 text-xs flex items-center gap-1"
                        title="Grant item"
                      >
                        <Gift className="h-3 w-3" />
                      </button>
                    </div>
                    {grantTarget === p.id && (
                      <div className="mt-2 glass rounded-lg p-2 space-y-1 max-w-xs">
                        <Label className="text-xs">Grant item to {p.username}</Label>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {shopItems.map((it) => (
                            <button
                              key={it.id}
                              onClick={() => grantItem(p.id, it.id)}
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary/50 flex justify-between"
                            >
                              <span>{it.name}</span>
                              <span className="text-muted-foreground">{it.price_coins}c</span>
                            </button>
                          ))}
                          {shopItems.length === 0 && <p className="text-xs text-muted-foreground">No items</p>}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">No players found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </main>
  );
}
