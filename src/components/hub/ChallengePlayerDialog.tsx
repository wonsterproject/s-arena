import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Swords, Coins, X, Dice5, Crown, Circle, Target, Crosshair, Zap } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { gameRoute, type GameType } from "@/hooks/useFriendInvite";

interface OpponentInfo {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_fake: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  opponent: OpponentInfo | null;
}

type Step = "game" | "bet" | "waiting";

const GAMES: { id: GameType; label: string; icon: React.ReactNode; gradient: string }[] = [
  { id: "ludo", label: "Ludo", icon: <Dice5 className="h-5 w-5" />, gradient: "from-rose-500 to-amber-400" },
  { id: "chess", label: "Chess", icon: <Crown className="h-5 w-5" />, gradient: "from-amber-700 to-yellow-300" },
  { id: "carrom", label: "Carrom", icon: <Circle className="h-5 w-5" />, gradient: "from-orange-700 to-yellow-500" },
  { id: "pool", label: "Pool", icon: <Target className="h-5 w-5" />, gradient: "from-emerald-700 to-lime-400" },
  { id: "arena", label: "Arena", icon: <Crosshair className="h-5 w-5" />, gradient: "from-rose-600 to-amber-400" },
  { id: "string_carrom", label: "Sling", icon: <Zap className="h-5 w-5" />, gradient: "from-amber-700 to-yellow-400" },
];

const BET_PRESETS = [50, 100, 500, 1000, 5000];
const COUNTDOWN_SECONDS = 10;

function initials(s?: string | null) {
  return (s ?? "?").slice(0, 2).toUpperCase();
}

export default function ChallengePlayerDialog({ open, onClose, opponent }: Props) {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>("game");
  const [game, setGame] = useState<GameType>("ludo");
  const [bet, setBet] = useState<number>(50);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const cancelledRef = useRef(false);

  // Reset whenever dialog opens
  useEffect(() => {
    if (open) {
      setStep("game");
      setGame("ludo");
      setBet(50);
      setCountdown(COUNTDOWN_SECONDS);
      cancelledRef.current = false;
    }
  }, [open]);

  const handleClose = () => {
    cancelledRef.current = true;
    onClose();
  };

  const startMatch = async () => {
    if (!opponent) return;
    if (bet < 50) {
      toast({ title: "Minimum bet is 50 coins", variant: "destructive" });
      return;
    }
    if (bet > (profile?.coins ?? 0)) {
      toast({ title: "Not enough coins", variant: "destructive" });
      return;
    }
    cancelledRef.current = false;
    setStep("waiting");
    setCountdown(COUNTDOWN_SECONDS);

    // Tick countdown
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, COUNTDOWN_SECONDS - elapsed);
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 200);

    try {
      // Wait full 10s for the cinematic feel
      await new Promise((r) => setTimeout(r, COUNTDOWN_SECONDS * 1000));
      if (cancelledRef.current) {
        clearInterval(tick);
        return;
      }

      // Create match against the opponent (fake user → bot match with their persona)
      if (opponent.is_fake) {
        const { data: matchId, error } = await supabase.rpc("start_match_with_fake_user", {
          _fake_user_id: opponent.id,
          _game: game as never,
          _bet: bet,
        });
        if (error) throw error;
        if (matchId) {
          await refreshProfile();
          clearInterval(tick);
          onClose();
          navigate(gameRoute(game, matchId as string));
          return;
        }
      } else {
        // Real player: send a friend-style match invite
        const { data: matchId, error } = await supabase.rpc("create_friend_match", {
          _mode: "1v1",
          _opponent: opponent.id,
          _bet: bet,
          _game: game as never,
        });
        if (error) throw error;
        if (matchId) {
          await refreshProfile();
          clearInterval(tick);
          onClose();
          navigate(gameRoute(game, matchId as string));
          return;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Try again";
      toast({ title: "Failed to start match", description: message, variant: "destructive" });
      setStep("bet");
    }
  };

  if (!opponent) return null;

  const opponentName = opponent.display_name || opponent.username;
  const insufficientCoins = bet > (profile?.coins ?? 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && step !== "waiting" && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-primary/40">
              {opponent.avatar_url ? <AvatarImage src={opponent.avatar_url} alt={opponentName} /> : null}
              <AvatarFallback>{initials(opponentName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground font-normal">Challenge</span>
              <span className="font-black">{opponentName}</span>
            </div>
          </DialogTitle>
          <DialogDescription>
            {step === "game" && "Pick a game to play"}
            {step === "bet" && "Set your bet amount"}
            {step === "waiting" && "Match starting…"}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: pick game */}
        {step === "game" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGame(g.id)}
                  className={`relative overflow-hidden rounded-2xl p-3 flex flex-col items-center gap-1.5 transition-all bg-gradient-to-br ${g.gradient} ${
                    game === g.id ? "ring-2 ring-primary scale-105" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  <div className="text-white drop-shadow">{g.icon}</div>
                  <span className="text-xs font-bold text-white drop-shadow">{g.label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={handleClose} className="glass-btn h-10 px-4 flex items-center gap-1">
                <X className="h-4 w-4" /> Cancel
              </button>
              <button
                onClick={() => setStep("bet")}
                className="glass-btn h-10 px-4 bg-gradient-to-r from-primary/40 to-accent/40 font-bold flex items-center gap-2"
              >
                Next <Swords className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: pick bet */}
        {step === "bet" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your balance:</span>
              <span className="flex items-center gap-1 font-bold">
                <Coins className="h-4 w-4 text-yellow-400" /> {profile?.coins ?? 0}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {BET_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setBet(p)}
                  disabled={p > (profile?.coins ?? 0)}
                  className={`glass-btn h-10 text-sm font-bold ${
                    bet === p ? "bg-primary/30 ring-1 ring-primary" : ""
                  } disabled:opacity-30`}
                >
                  {p === 0 ? "Free" : `🪙 ${p}`}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Custom amount</label>
              <input
                type="number"
                min={0}
                max={profile?.coins ?? 0}
                value={bet}
                onChange={(e) => setBet(Math.max(0, Math.min(profile?.coins ?? 0, Number(e.target.value))))}
                className="w-full h-11 mt-1 rounded-lg bg-secondary/50 px-3 text-lg font-bold border border-border"
              />
              {insufficientCoins && (
                <p className="text-xs text-red-400 mt-1">Not enough coins</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Pot total: <strong className="text-yellow-400">{bet * 2} coins</strong> · winner takes all
            </p>
            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => setStep("game")} className="glass-btn h-10 px-4">
                ← Back
              </button>
              <button
                onClick={startMatch}
                disabled={insufficientCoins}
                className="glass-btn h-10 px-5 bg-gradient-to-r from-primary/50 to-accent/50 font-black flex items-center gap-2 disabled:opacity-40"
              >
                <Swords className="h-4 w-4" /> Challenge
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: waiting countdown */}
        {step === "waiting" && (
          <div className="flex flex-col items-center justify-center py-6 gap-4">
            <div className="relative">
              <div className="h-28 w-28 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center ring-2 ring-primary/40 animate-pulse">
                <span className="text-5xl font-black text-glow">{countdown}</span>
              </div>
              <Loader2 className="absolute -top-2 -right-2 h-7 w-7 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="font-black text-lg">Connecting to {opponentName}…</p>
              <p className="text-xs text-muted-foreground mt-1">
                {GAMES.find((g) => g.id === game)?.label} · 🪙 {bet} bet · winner takes {bet * 2}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="glass-btn h-9 px-4 flex items-center gap-2 text-red-400 text-sm"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
