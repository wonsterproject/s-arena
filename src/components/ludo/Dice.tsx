import { useEffect, useState } from "react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";

const ICONS = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

interface DiceProps {
  value: number;
  rolling: boolean;
  onRoll: () => void;
  disabled: boolean;
  color: string;
}

export function Dice({ value, rolling, onRoll, disabled, color }: DiceProps) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!rolling) {
      setDisplay(value);
      return;
    }
    const id = window.setInterval(() => {
      setDisplay(Math.floor(Math.random() * 6) + 1);
    }, 80);
    return () => window.clearInterval(id);
  }, [rolling, value]);

  const Icon = ICONS[(display - 1) as 0 | 1 | 2 | 3 | 4 | 5] ?? Dice1;

  return (
    <button
      onClick={onRoll}
      disabled={disabled || rolling}
      className="glass-btn group flex h-24 w-24 items-center justify-center rounded-3xl disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ boxShadow: `0 0 30px ${color}55, inset 0 0 20px ${color}22` }}
      aria-label="Roll dice"
    >
      <Icon
        className={`h-14 w-14 ${rolling ? "animate-dice-roll" : "transition-transform group-hover:scale-110"}`}
        style={{ color }}
        strokeWidth={2.2}
      />
    </button>
  );
}
