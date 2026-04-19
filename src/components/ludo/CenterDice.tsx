import { useEffect, useState } from "react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

const ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

interface CenterDiceProps {
  value: number;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
  color: string;
}

/** Premium 3D-look dice that lives in the center of the board. */
export function CenterDice({ value, rolling, onRoll, disabled, color }: CenterDiceProps) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!rolling) { setDisplay(value); return; }
    const id = window.setInterval(() => setDisplay(Math.floor(Math.random() * 6) + 1), 80);
    return () => window.clearInterval(id);
  }, [rolling, value]);
  const Icon = ICONS[(display - 1) as 0 | 1 | 2 | 3 | 4 | 5] ?? Dice1;
  return (
    <button
      onClick={onRoll}
      disabled={disabled || rolling}
      className="relative flex aspect-square w-[78%] items-center justify-center rounded-2xl transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        background: `
          radial-gradient(circle at 28% 22%, hsl(0 0% 100% / 0.85), hsl(0 0% 100% / 0.4) 22%, hsl(0 0% 100% / 0.15) 45%, hsl(0 0% 0% / 0.4) 100%),
          linear-gradient(160deg, hsl(0 0% 100%), hsl(0 0% 88%) 60%, hsl(0 0% 75%))
        `,
        boxShadow: `
          0 8px 18px hsl(0 0% 0% / 0.55),
          0 0 0 2px ${color},
          0 0 22px ${color}cc,
          inset 0 -4px 0 hsl(0 0% 0% / 0.18),
          inset 0 2px 0 hsl(0 0% 100% / 0.6)
        `,
      }}
      aria-label="Roll dice"
    >
      <Icon
        className={`h-[62%] w-[62%] ${rolling ? "animate-dice-roll" : "transition-transform"}`}
        style={{ color: "hsl(230 60% 12%)" }}
        strokeWidth={2.6}
      />
      {/* swirl glow underneath */}
      <span
        className="pointer-events-none absolute -inset-3 rounded-3xl -z-10"
        style={{
          background: `radial-gradient(closest-side, ${color}55, transparent 70%)`,
          filter: "blur(6px)",
        }}
      />
      {/* color indicator dot */}
      <span
        className="absolute -top-1 -right-1 h-3 w-3 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </button>
  );
}
