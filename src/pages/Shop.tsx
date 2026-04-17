import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, Loader2, Check, Lock, Gift, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface ShopItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  price_coins: number;
  preview: string | null;
}

const rarityClass: Record<string, string> = {
  common: "border-slate-400/40",
  rare: "border-blue-400/60 shadow-[0_0_20px_rgba(96,165,250,0.3)]",
  epic: "border-purple-400/60 shadow-[0_0_20px_rgba(192,132,252,0.4)]",
  legendary: "border-yellow-400/70 shadow-[0_0_30px_rgba(250,204,21,0.5)]",
};

export default function Shop() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: shop }, { data: inv }, { data: dr }] = await Promise.all([
      supabase.from("shop_items").select("*").order("price_coins"),
      supabase.from("user_inventory").select("item_id"),
      supabase.from("daily_rewards").select("streak, last_claim_at"),
    ]);
    setItems((shop as ShopItem[]) ?? []);
    setOwned(new Set((inv ?? []).map((r: any) => r.item_id)));
    setStreak(dr?.[0]?.streak ?? 0);
    setLoading(false);
  };

  const buy = async (item: ShopItem) => {
    setBuying(item.id);
    const { data, error } = await supabase.rpc("purchase_shop_item", { _item_id: item.id });
    if (error) {
      toast({ title: "Purchase failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Bought ${item.name}!`, description: `Balance: ${(data as any)?.[0]?.total_coins ?? "?"} coins` });
      await Promise.all([refreshProfile(), load()]);
    }
    setBuying(null);
  };

  const claimDaily = async () => {
    setClaiming(true);
    const { data, error } = await supabase.rpc("claim_daily_reward");
    if (error) {
      toast({ title: "Cannot claim", description: error.message, variant: "destructive" });
    } else {
      const r = (data as any)?.[0];
      toast({ title: `+${r?.coins_awarded} coins!`, description: `Streak: ${r?.new_streak} day${r?.new_streak === 1 ? "" : "s"} 🔥` });
      await Promise.all([refreshProfile(), load()]);
    }
    setClaiming(false);
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <header className="mx-auto mb-6 flex max-w-5xl items-center justify-between">
        <button onClick={() => navigate("/lobby")} className="glass-btn h-10 flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> <span className="text-sm">Back</span>
        </button>
        <h1 className="text-xl font-black text-glow">Shop</h1>
        <div className="glass-btn h-10 flex items-center gap-2 pointer-events-none">
          <Coins className="h-4 w-4 text-yellow-400" />
          <span className="text-sm font-bold">{profile?.coins ?? 0}</span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl mb-6">
        <div className="glass rounded-2xl p-5 flex items-center gap-4 neon-border">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-yellow-500/40 to-orange-500/30 flex items-center justify-center">
            <Gift className="h-7 w-7 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-lg">Daily Reward</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Flame className="h-3 w-3 text-orange-400" /> Streak: {streak ?? 0} day{streak === 1 ? "" : "s"} · come back daily for more
            </p>
          </div>
          <button
            onClick={claimDaily}
            disabled={claiming}
            className="glass-btn h-11 px-4 bg-gradient-to-r from-yellow-500/40 to-orange-500/40 font-bold flex items-center gap-2"
          >
            {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            Claim
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl">
        <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">Cosmetics</h2>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const isOwned = owned.has(item.id);
              const canAfford = (profile?.coins ?? 0) >= item.price_coins;
              return (
                <div key={item.id} className={`glass rounded-2xl p-4 border-2 ${rarityClass[item.rarity]}`}>
                  <div
                    className="h-24 rounded-xl mb-3 flex items-center justify-center text-3xl font-black"
                    style={{ background: `linear-gradient(135deg, ${item.preview ?? "#888"}, ${item.preview ?? "#888"}80)` }}
                  >
                    {item.type === "token_skin" ? "●" : item.type === "dice_skin" ? "⚀" : item.type === "avatar_frame" ? "◇" : "▣"}
                  </div>
                  <p className="font-black truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{item.rarity} · {item.type.replace("_", " ")}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1 min-h-[2rem]">{item.description}</p>
                  <button
                    onClick={() => buy(item)}
                    disabled={isOwned || !canAfford || buying === item.id}
                    className={`w-full mt-3 glass-btn h-10 flex items-center justify-center gap-2 text-sm font-bold ${
                      isOwned ? "bg-green-500/20" : !canAfford ? "opacity-50" : "bg-gradient-to-r from-primary/40 to-accent/40"
                    }`}
                  >
                    {buying === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> :
                      isOwned ? <><Check className="h-4 w-4" /> Owned</> :
                      !canAfford ? <><Lock className="h-4 w-4" /> {item.price_coins}</> :
                      <><Coins className="h-4 w-4 text-yellow-400" /> {item.price_coins}</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
