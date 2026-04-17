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

/** Compact dice that lives in the center of the board. Shows only the active player's color (no name). */
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
      className="relative flex aspect-square w-[72%] items-center justify-center rounded-2xl transition-transform active:scale-95 disabled:cursor-not-allowed"
      style={{
        background: `radial-gradient(circle at 30% 25%, hsl(0 0% 100% / 0.18), hsl(0 0% 0% / 0.5)), ${color}22`,
        boxShadow: `0 0 20px ${color}aa, inset 0 0 12px ${color}55, 0 0 0 2px ${color}`,
      }}
      aria-label="Roll dice"
    >
      <Icon
        className={`h-[60%] w-[60%] ${rolling ? "animate-dice-roll" : "transition-transform"}`}
        style={{ color }}
        strokeWidth={2.4}
      />
      {/* Color-only indicator dot */}
      <span
        className="absolute -top-1 -right-1 h-3 w-3 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </button>
  );
}
