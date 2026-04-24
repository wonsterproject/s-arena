import { useNavigate } from "react-router-dom";
import { LogOut, Coins, Trophy, ShoppingBag, User, ShieldCheck, Crown, Dice5, Circle, Target, Crosshair, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import OnlinePlayersPanel from "@/components/hub/OnlinePlayersPanel";
import ReferralCard from "@/components/hub/ReferralCard";
import WhatsAppFloat from "@/components/WhatsAppFloat";

interface GameCard {
  id: string;
  title: string;
  tagline: string;
  icon: React.ReactNode;
  gradient: string;
  route: string;
  status: "live" | "soon";
}

const GAMES: GameCard[] = [
  {
    id: "ludo",
    title: "Ludo",
    tagline: "Classic 4-player race",
    icon: <Dice5 className="h-12 w-12" />,
    gradient: "from-rose-500 via-fuchsia-500 to-amber-400",
    route: "/lobby",
    status: "live",
  },
  {
    id: "chess",
    title: "Chess",
    tagline: "Strategy with full rules + AI",
    icon: <Crown className="h-12 w-12" />,
    gradient: "from-amber-700 via-amber-500 to-yellow-300",
    route: "/chess/lobby",
    status: "live",
  },
  {
    id: "carrom",
    title: "Carrom 3D",
    tagline: "Real physics, queen + cover",
    icon: <Circle className="h-12 w-12" />,
    gradient: "from-orange-700 via-amber-600 to-yellow-500",
    route: "/carrom/lobby",
    status: "live",
  },
  {
    id: "pool",
    title: "8-Ball Pool",
    tagline: "Classic billiards physics",
    icon: <Target className="h-12 w-12" />,
    gradient: "from-emerald-700 via-emerald-500 to-lime-400",
    route: "/pool/lobby",
    status: "live",
  },
  {
    id: "arena",
    title: "TPP Arena · 1v1",
    tagline: "Third-person shooter · 3D",
    icon: <Crosshair className="h-12 w-12" />,
    gradient: "from-rose-600 via-orange-500 to-amber-400",
    route: "/arena/lobby",
    status: "live",
  },
  {
    id: "string-carrom",
    title: "Sling Puck",
    tagline: "Pull · Sling · Win",
    icon: <Zap className="h-12 w-12" />,
    gradient: "from-amber-700 via-orange-600 to-yellow-400",
    route: "/string-carrom/lobby",
    status: "live",
  },
];

export default function Hub() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();

  const handleSignOut = async () => { await signOut(); navigate("/login"); };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Top bar */}
        <header className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <span className="text-2xl font-black">S</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-glow tracking-tight">S-ARENA</h1>
              <p className="text-xs text-muted-foreground">Welcome back, {profile?.username ?? "player"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="glass px-3 py-1.5 rounded-full flex items-center gap-1.5 text-sm font-bold">
              <Coins className="h-4 w-4 text-yellow-400" />
              {profile?.coins ?? 0}
            </div>
            <button onClick={() => navigate("/shop")} className="glass-btn h-9 px-3 flex items-center gap-1 text-sm"><ShoppingBag className="h-4 w-4" /> Shop</button>
            <button onClick={() => navigate("/leaderboard")} className="glass-btn h-9 px-3 flex items-center gap-1 text-sm"><Trophy className="h-4 w-4" /> Top</button>
            <button onClick={() => navigate("/profile")} className="glass-btn h-9 w-9 flex items-center justify-center"><User className="h-4 w-4" /></button>
            {isAdmin && (
              <button onClick={() => navigate("/admin")} className="glass-btn h-9 w-9 flex items-center justify-center text-primary"><ShieldCheck className="h-4 w-4" /></button>
            )}
            <button onClick={handleSignOut} className="glass-btn h-9 w-9 flex items-center justify-center"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>

        {/* Hero */}
        <section className="text-center mb-10">
          <h2 className="text-4xl sm:text-5xl font-black text-glow mb-2">Pick your game</h2>
          <p className="text-muted-foreground">Four classic games. One arena. Win coins. Climb the leaderboard.</p>
        </section>

        {/* Games grid */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {GAMES.map(g => (
            <button
              key={g.id}
              onClick={() => g.status === "live" ? navigate(g.route) : null}
              disabled={g.status === "soon"}
              className={`group relative overflow-hidden rounded-3xl p-6 text-left transition-all
                ${g.status === "live" ? "hover:scale-105 cursor-pointer" : "opacity-60 cursor-not-allowed"}
                bg-gradient-to-br ${g.gradient} shadow-xl ring-1 ring-white/10`}
            >
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              <div className="relative z-10">
                <div className="text-white drop-shadow-lg mb-4">{g.icon}</div>
                <h3 className="text-2xl font-black text-white drop-shadow mb-1">{g.title}</h3>
                <p className="text-sm text-white/90 drop-shadow">{g.tagline}</p>
                <div className="mt-4">
                  {g.status === "live" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold bg-white/20 backdrop-blur px-3 py-1 rounded-full text-white">
                      ▶ PLAY NOW
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold bg-black/30 backdrop-blur px-3 py-1 rounded-full text-white/80">
                      🔒 COMING SOON
                    </span>
                  )}
                </div>
              </div>
              {/* Floating decor */}
              <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl group-hover:scale-150 transition-transform" />
            </button>
          ))}
        </section>

        {/* Referral + Online Players */}
        <section className="grid lg:grid-cols-2 gap-4 mb-10">
          <ReferralCard />
          <OnlinePlayersPanel />
        </section>

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          S-ARENA · Play. Win. Repeat.
        </footer>
      </div>
      <WhatsAppFloat />
    </main>
  );
}
