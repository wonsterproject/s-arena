import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, LogIn, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // If already logged in as admin, go straight to panel
  useEffect(() => {
    if (loading || roleLoading) return;
    if (user && isAdmin) navigate("/admin", { replace: true });
  }, [user, isAdmin, loading, roleLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u || password.length < 6) {
      toast({ title: "Enter username and password", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // Try admin domain first, then fall back to player domain
      const candidates = [`${u.toLowerCase()}@admin.local`, `${u.toLowerCase()}@ludo.local`];
      let signInData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"] | null = null;
      let lastError: any = null;
      for (const email of candidates) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) { signInData = data; lastError = null; break; }
        lastError = error;
      }
      if (!signInData) throw lastError ?? new Error("Login failed");
      const signIn = signInData;

      // Verify admin role server-side
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", signIn.user!.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleRow) {
        await supabase.auth.signOut();
        throw new Error("This account is not an admin.");
      }

      toast({ title: "Welcome, Admin" });
      navigate("/admin", { replace: true });
    } catch (err: any) {
      const msg = err?.message ?? "Login failed";
      toast({
        title: "Admin login failed",
        description: msg.includes("Invalid") ? "Wrong username or password" : msg,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 bg-background">
      <div className="glass relative z-10 w-full max-w-md rounded-3xl p-8 neon-border animate-fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent mb-3 shadow-lg">
            <ShieldCheck className="h-9 w-9 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black text-glow tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-1">Restricted access — admin login only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-username">Admin username</Label>
            <Input
              id="admin-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="wonster"
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <div className="relative">
              <Input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="bg-secondary/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-foreground transition"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="glass-btn w-full flex items-center justify-center gap-2 bg-gradient-to-r from-primary/30 to-accent/30 hover:from-primary/50 hover:to-accent/50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Enter Admin Panel
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Player?{" "}
          <button onClick={() => navigate("/login")} className="text-primary hover:underline">
            Go to player login
          </button>
        </p>
      </div>
    </main>
  );
}
