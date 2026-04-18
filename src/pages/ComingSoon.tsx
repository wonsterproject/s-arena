import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";

interface Props { title: string; description: string }

export default function ComingSoon({ title, description }: Props) {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen px-4 py-6 flex items-center justify-center">
      <div className="max-w-md w-full">
        <button onClick={() => navigate("/hub")} className="glass-btn mb-6 flex items-center gap-2 px-4 h-10">
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>
        <div className="glass rounded-3xl p-8 text-center neon-border">
          <Sparkles className="h-16 w-16 mx-auto text-primary mb-4 animate-pulse" />
          <h1 className="text-3xl font-black text-glow mb-2">{title}</h1>
          <p className="text-muted-foreground mb-6">{description}</p>
          <p className="text-xs text-muted-foreground">
            Yeh game next update mein add ho raha hai with full physics + multiplayer + bot. Stay tuned!
          </p>
        </div>
      </div>
    </main>
  );
}
