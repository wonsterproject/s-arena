import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Cpu, Swords, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import FriendsInvitePanel from "@/components/lobby/FriendsInvitePanel";
import OnlineMatchPanel from "@/components/lobby/OnlineMatchPanel";

export default function PoolLobby() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const startBot = (diff: "easy" | "medium" | "hard") => navigate(`/pool/play?mode=bot&diff=${diff}`);

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate("/hub")} className="glass-btn mb-6 flex items-center gap-2 px-4 h-10">
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-700 to-lime-500 flex items-center justify-center shadow-lg">
            <Target className="h-8 w-8 text-emerald-50" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-glow">8-BALL POOL</h1>
            <p className="text-sm text-muted-foreground">Full rules, real physics, smart AI</p>
          </div>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Play vs Bot</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <ModeBtn icon={<Bot className="h-5 w-5" />} title="Easy" desc="Beginner-friendly" onClick={() => startBot("easy")} />
              <ModeBtn icon={<Cpu className="h-5 w-5" />} title="Medium" desc="Balanced challenge" onClick={() => startBot("medium")} />
              <ModeBtn icon={<Swords className="h-5 w-5" />} title="Hard" desc="Sharp aim" onClick={() => startBot("hard")} />
            </div>
          </div>

          <OnlineMatchPanel game="pool" gameLabel="Pool" />

          <FriendsInvitePanel game="pool" gameLabel="Pool" />

          <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">
            🪙 Balance: <span className="font-bold text-yellow-400">{profile?.coins ?? 0}</span> coins · Min bet 50 · Winner takes all
          </div>

          <div className="glass rounded-2xl p-4 text-sm">
            <div className="font-bold mb-2">How to play</div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Drag from the cue ball to set aim direction</li>
              <li>Adjust the power slider, then tap SHOOT</li>
              <li>First legal pot decides your group: solids (1-7) or stripes (9-15)</li>
              <li>Clear all your group, then pot the 8-ball to win</li>
              <li>Scratching the cue or pocketing the 8-ball early loses the game</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

function ModeBtn({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass-btn group flex items-center gap-3 p-4 text-left hover:scale-[1.02] transition-transform">
      <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">{icon}</div>
      <div className="flex-1">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}
