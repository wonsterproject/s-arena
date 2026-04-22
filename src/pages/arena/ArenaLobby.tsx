import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Cpu, Swords, Target, Coins } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import FriendsInvitePanel from "@/components/lobby/FriendsInvitePanel";
import OnlineMatchPanel from "@/components/lobby/OnlineMatchPanel";
import BotBetDialog from "@/components/lobby/BotBetDialog";

export default function ArenaLobby() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [betDialog, setBetDialog] = useState<"medium" | "hard" | null>(null);

  const startEasy = () => navigate(`/arena/play?mode=bot&diff=easy`);

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate("/hub")} className="glass-btn mb-6 flex items-center gap-2 px-4 h-10">
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 flex items-center justify-center shadow-lg">
            <Target className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-glow">TPP ARENA · 1v1</h1>
            <p className="text-sm text-muted-foreground">Third-person shooter · 3D arena · first to 10 wins</p>
          </div>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Play vs Bot</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <ModeBtn icon={<Bot className="h-5 w-5" />} title="Easy" desc="Free · Practice mode" onClick={startEasy} />
              <ModeBtn icon={<Cpu className="h-5 w-5" />} title="Medium" desc="Bet · Win 2× coins" badge onClick={() => setBetDialog("medium")} />
              <ModeBtn icon={<Swords className="h-5 w-5" />} title="Hard" desc="Bet · Win 2× coins" badge onClick={() => setBetDialog("hard")} />
            </div>
          </div>

          <OnlineMatchPanel game="arena" gameLabel="Arena" />

          <FriendsInvitePanel game="arena" gameLabel="Arena" />

          <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">
            🪙 Balance: <span className="font-bold text-yellow-400">{profile?.coins ?? 0}</span> coins · Min bet 50 · Winner takes 2×
          </div>

          <div className="glass rounded-2xl p-4 text-sm">
            <div className="font-bold mb-2">Controls</div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li><b>Mobile:</b> left joystick to move (push to edge to sprint), right side to look, FIRE / ADS / JUMP / RELOAD buttons</li>
              <li><b>Desktop:</b> WASD move · Mouse look · Click to fire · Right-click ADS · Space jump · R reload · Shift sprint</li>
              <li>First player to 10 kills wins · Match cap 5:00 · Headshots deal 2× damage</li>
            </ul>
          </div>
        </section>
      </div>

      <BotBetDialog
        open={betDialog !== null}
        onClose={() => setBetDialog(null)}
        game="arena"
        difficulty={betDialog ?? "medium"}
        onCreated={(matchId) => {
          const diff = betDialog ?? "medium";
          setBetDialog(null);
          navigate(`/arena/play?mode=bot&diff=${diff}&id=${matchId}`);
        }}
      />
    </main>
  );
}

function ModeBtn({ icon, title, desc, onClick, badge }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; badge?: boolean }) {
  return (
    <button onClick={onClick} className="glass-btn group flex items-center gap-3 p-4 text-left hover:scale-[1.02] transition-transform relative">
      {badge && (
        <span className="absolute -top-1 -right-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/30 text-yellow-300 border border-yellow-500/50 flex items-center gap-1">
          <Coins className="h-2.5 w-2.5" /> BET
        </span>
      )}
      <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">{icon}</div>
      <div className="flex-1">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
