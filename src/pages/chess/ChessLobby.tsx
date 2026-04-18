import { useNavigate } from "react-router-dom";
import { Bot, Users, Swords, ArrowLeft, Cpu, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ChessLobby() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const startBot = (difficulty: "easy" | "medium" | "hard") => {
    const id = `local-${Date.now()}`;
    navigate(`/chess/play?mode=bot&diff=${difficulty}&id=${id}`);
  };

  const startLocal = () => {
    navigate(`/chess/play?mode=local&id=local-${Date.now()}`);
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate("/hub")} className="glass-btn mb-6 flex items-center gap-2 px-4 h-10">
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>

        <div className="flex items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center shadow-lg">
            <Crown className="h-8 w-8 text-amber-100" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-glow">CHESS</h1>
            <p className="text-sm text-muted-foreground">Classic chess with full rule enforcement</p>
          </div>
        </div>

        <section className="space-y-6">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Play vs Bot</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <ModeBtn icon={<Bot className="h-5 w-5" />} title="Easy" desc="Beginner-friendly" onClick={() => startBot("easy")} />
              <ModeBtn icon={<Cpu className="h-5 w-5" />} title="Medium" desc="Balanced challenge" onClick={() => startBot("medium")} />
              <ModeBtn icon={<Swords className="h-5 w-5" />} title="Hard" desc="Tactical & deep" onClick={() => startBot("hard")} />
            </div>
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Local 2 Player</h2>
            <ModeBtn icon={<Users className="h-5 w-5" />} title="Pass & Play" desc="Same device, two players" onClick={startLocal} />
          </div>

          <div className="glass rounded-2xl p-4 text-sm text-muted-foreground">
            🪙 Your balance: <span className="font-bold text-yellow-400">{profile?.coins ?? 0}</span> coins
            <br />
            <span className="text-xs">Wager matches with friends coming next — invite from the Friends tab in Ludo lobby.</span>
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
