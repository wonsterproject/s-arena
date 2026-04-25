// Pre-match VS animation — shows BOTH players' names in a punchy fight-card
// style when the match transitions to "active". Both clients see this for the
// same ~2.4s before the actual game UI takes over.
import { useEffect, useState } from "react";

interface Props {
  myName: string;
  opponentName: string;
  /** Coins at stake (one side). Pot displayed = bet * 2. Optional. */
  bet?: number;
  /** Called when the animation finishes so the parent can hand control to the game. */
  onDone: () => void;
  /** Total animation duration, ms. Default 2400. */
  durationMs?: number;
}

const initials = (s: string) => (s || "?").trim().slice(0, 2).toUpperCase();

export default function PreMatchVS({ myName, opponentName, bet, onDone, durationMs = 2400 }: Props) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), durationMs - 400);
    const t3 = setTimeout(() => onDone(), durationMs);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone, durationMs]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md transition-opacity duration-300 ${
        phase === "out" ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "hsl(var(--background) / 0.85)" }}
    >
      {/* Decorative pulsing rings */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border-2 border-primary/30 animate-ping" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border-2 border-accent/40 animate-pulse" />
      </div>

      <div className="relative flex items-center gap-4 sm:gap-8 px-4 sm:px-10 py-6 sm:py-10 max-w-3xl w-full">
        {/* My side */}
        <PlayerCard
          name={myName}
          subtitle="You"
          slideFrom="left"
          colorFrom="hsl(var(--primary))"
          colorTo="hsl(var(--accent))"
        />

        {/* VS badge */}
        <div
          className={`relative shrink-0 transition-all duration-500 ${
            phase === "in" ? "scale-0 rotate-45 opacity-0" : "scale-100 rotate-0 opacity-100"
          }`}
        >
          <div
            className="grid place-items-center h-20 w-20 sm:h-28 sm:w-28 rounded-full font-black text-3xl sm:text-5xl text-primary-foreground shadow-2xl"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
              boxShadow: "0 0 30px hsl(var(--primary) / 0.7), 0 0 60px hsl(var(--accent) / 0.5)",
            }}
          >
            VS
          </div>
          {bet && bet > 0 && (
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-black text-yellow-300 bg-background/90 border border-yellow-400/60 shadow-lg">
              🪙 Pot: {bet * 2}
            </div>
          )}
        </div>

        {/* Opponent side */}
        <PlayerCard
          name={opponentName}
          subtitle="Opponent"
          slideFrom="right"
          colorFrom="hsl(var(--accent))"
          colorTo="hsl(var(--destructive))"
        />
      </div>

      {/* "Get ready" footer */}
      <div
        className={`absolute bottom-12 left-1/2 -translate-x-1/2 transition-all duration-500 ${
          phase === "in" ? "translate-y-4 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <p className="text-sm sm:text-base font-bold uppercase tracking-[0.3em] text-muted-foreground">
          Get Ready
        </p>
      </div>
    </div>
  );
}

interface CardProps {
  name: string;
  subtitle: string;
  slideFrom: "left" | "right";
  colorFrom: string;
  colorTo: string;
}

function PlayerCard({ name, subtitle, slideFrom, colorFrom, colorTo }: CardProps) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 50);
    return () => clearTimeout(t);
  }, []);

  const enterClass = show
    ? "translate-x-0 opacity-100"
    : slideFrom === "left"
      ? "-translate-x-12 opacity-0"
      : "translate-x-12 opacity-0";

  return (
    <div className={`flex-1 min-w-0 transition-all duration-700 ease-out ${enterClass}`}>
      <div
        className="flex flex-col items-center gap-3 rounded-3xl p-4 sm:p-6 border-2 border-primary/30"
        style={{
          background: `linear-gradient(135deg, ${colorFrom}33, ${colorTo}1a)`,
          boxShadow: `0 10px 40px ${colorFrom}55, inset 0 0 20px ${colorTo}33`,
        }}
      >
        <div
          className="grid place-items-center h-16 w-16 sm:h-24 sm:w-24 rounded-full font-black text-2xl sm:text-4xl text-primary-foreground shadow-xl"
          style={{
            background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})`,
          }}
        >
          {initials(name)}
        </div>
        <div className="text-center min-w-0 w-full">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{subtitle}</p>
          <p className="font-black text-base sm:text-2xl truncate text-foreground">@{name}</p>
        </div>
      </div>
    </div>
  );
}
