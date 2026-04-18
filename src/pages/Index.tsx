import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dice5, Crown, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) navigate("/hub", { replace: true });
  }, [user, loading, navigate]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl">
            <span className="text-3xl font-black text-primary-foreground">S</span>
          </div>
        </div>
        <h1 className="text-5xl sm:text-6xl font-black text-glow tracking-tight mb-3">S-ARENA</h1>
        <p className="text-muted-foreground mb-8">Ludo · Chess · Carrom · 8-Ball Pool — One arena, infinite battles.</p>

        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        ) : (
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate("/login")} className="glass-btn h-12 px-6 font-bold">Log in</button>
            <button onClick={() => navigate("/signup")} className="glass-btn h-12 px-6 font-bold bg-gradient-to-r from-primary/40 to-accent/40">Sign up</button>
          </div>
        )}

        <div className="mt-12 flex items-center justify-center gap-6 opacity-70">
          <Dice5 className="h-8 w-8 text-rose-400" />
          <Crown className="h-8 w-8 text-amber-300" />
          <div className="h-8 w-8 rounded-full bg-orange-500" />
          <div className="h-8 w-8 rounded-full bg-emerald-500" />
        </div>
      </div>
    </main>
  );
}
