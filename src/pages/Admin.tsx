import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, Save, ShieldCheck, ShieldOff, Gift, ArrowLeft, Coins, Trophy, Swords, Wallet, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, Partial<PlayerRow>>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [grantTarget, setGrantTarget] = useState<string | null>(null);
  const [tab, setTab] = useState<"players" | "payments">("players");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (!isAdmin) {
      toast({ title: "Access denied", description: "Admins only", variant: "destructive" });
      navigate("/lobby", { replace: true });
      return;
    }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, authLoading, roleLoading]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: profs }, { data: roles }, { data: items }, { count }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, coins, wins, losses").order("coins", { ascending: false }).limit(500),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("shop_items").select("id, name, price_coins").order("price_coins"),
      supabase.from("payment_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    const adminSet = new Set<string>((roles ?? []).map((r: any) => r.user_id));
    setAdminIds(adminSet);
    setPlayers((profs ?? []).map((p: any) => ({ ...p, is_admin: adminSet.has(p.id) })));
    setShopItems((items ?? []) as ShopItem[]);
    setPendingCount(count ?? 0);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) => p.username.toLowerCase().includes(q) || (p.display_name ?? "").toLowerCase().includes(q),
    );
  }, [players, search]);

  const setField = (id: string, field: keyof PlayerRow, value: string | number) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getValue = (p: PlayerRow, field: keyof PlayerRow) => {
    const e = editing[p.id];
    return (e && e[field] !== undefined ? e[field] : p[field]) as any;
  };

  const isDirty = (id: string) => !!editing[id] && Object.keys(editing[id]).length > 0;

  const save = async (p: PlayerRow) => {
    const e = editing[p.id];
    if (!e) return;
    setSavingId(p.id);
    const { error } = await supabase.rpc("admin_update_profile", {
      _user_id: p.id,
      _coins: e.coins !== undefined ? Number(e.coins) : null,
      _wins: e.wins !== undefined ? Number(e.wins) : null,
      _losses: e.losses !== undefined ? Number(e.losses) : null,
      _display_name: e.display_name !== undefined ? String(e.display_name) : null,
      _username: e.username !== undefined ? String(e.username) : null,
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

  const toggleAdmin = async (p: PlayerRow) => {
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

      <div className="mx-auto max-w-6xl flex gap-2 mb-4">
        <button
          onClick={() => setTab("players")}
          className={`glass-btn h-10 px-4 flex items-center gap-2 text-sm ${tab === "players" ? "bg-gradient-to-r from-primary/40 to-accent/40" : ""}`}
        >
          <Users className="h-4 w-4" /> Players
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

      {tab === "payments" ? (
        <section className="mx-auto max-w-6xl">
          <PaymentRequestsPanel />
        </section>
      ) : (
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
