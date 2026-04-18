import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, LogIn, UserPlus, Dice5, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthPageProps {
  mode: "login" | "signup";
}

export default function Auth({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/hub", { replace: true });
  }, [user, loading, navigate]);

  const validate = () => {
    const u = username.trim();
    if (u.length < 3 || u.length > 20) {
      toast({ title: "Invalid username", description: "3 to 20 characters", variant: "destructive" });
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(u)) {
      toast({ title: "Invalid username", description: "Only letters, numbers, _", variant: "destructive" });
      return false;
    }
    if (password.length < 6) {
      toast({ title: "Password too short", description: "At least 6 characters", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    const email = usernameToEmail(username);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/hub`,
            data: { username: username.trim().toLowerCase() },
          },
        });
        if (error) throw error;
        // Auto-login after signup since email auto-confirm is enabled
        if (!(await supabase.auth.getSession()).data.session) {
          await supabase.auth.signInWithPassword({ email, password });
        }
        toast({ title: "Account created!", description: "Welcome to S-ARENA" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Logged in" });
      }
    } catch (err: any) {
      const msg = err?.message ?? "Something went wrong";
      toast({
        title: mode === "signup" ? "Signup failed" : "Login failed",
        description: msg.includes("already") ? "Username already taken" : msg.includes("Invalid") ? "Wrong username or password" : msg,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden flex items-center justify-center px-4">
      <FloatingTokens />
      <div className="glass relative z-10 w-full max-w-md rounded-3xl p-8 neon-border animate-fade-in">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent mb-3 shadow-lg">
            <Dice5 className="h-9 w-9 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-black text-glow tracking-tight">S-ARENA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signup" ? "Create your account to play" : "Welcome back, champion"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="player123"
              className="bg-secondary/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? (
            <>Already have an account? <Link to="/login" className="text-primary hover:underline">Log in</Link></>
          ) : (
            <>New here? <Link to="/signup" className="text-primary hover:underline">Create an account</Link></>
          )}
        </p>
      </div>
    </main>
  );
}

function FloatingTokens() {
  const colors = ["hsl(var(--red))", "hsl(var(--blue))", "hsl(var(--green))", "hsl(var(--yellow))"];
  const tokens = Array.from({ length: 14 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {tokens.map((_, i) => {
        const color = colors[i % 4];
        const size = 20 + (i % 5) * 10;
        const left = (i * 37) % 100;
        const delay = (i % 7) * 0.7;
        const duration = 9 + (i % 5) * 2;
        return (
          <span
            key={i}
            className="absolute rounded-full animate-float-token"
            style={{
              left: `${left}%`,
              top: "-10%",
              width: size,
              height: size,
              background: `radial-gradient(circle at 30% 25%, hsl(0 0% 100% / 0.7), ${color} 60%)`,
              boxShadow: `0 0 24px ${color}, inset 0 0 0 2px hsl(0 0% 100% / 0.25)`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              opacity: 0.8,
            }}
          />
        );
      })}
    </div>
  );
}
