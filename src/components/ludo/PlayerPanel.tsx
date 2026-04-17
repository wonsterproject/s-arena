import { PlayerColor, PLAYER_HEX, PLAYER_LABEL } from "@/game/ludoConstants";

interface PlayerPanelProps {
  color: PlayerColor;
  active: boolean;
  finishedCount: number;
  baseCount: number;
}

export function PlayerPanel({ color, active, finishedCount, baseCount }: PlayerPanelProps) {
  const c = PLAYER_HEX[color];
  return (
    <div
      className={`glass rounded-2xl p-4 transition-all ${active ? "player-active" : "opacity-70"}`}
      style={active ? ({ "--primary": `var(--${color})` } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full"
          style={{ background: c, boxShadow: `0 0 12px ${c}` }}
        />
        <h3 className="font-bold tracking-wide">{PLAYER_LABEL[color]}</h3>
        {active && (
          <span className="ml-auto text-[10px] uppercase tracking-widest opacity-80">
            Your turn
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>🏠 {baseCount}</span>
        <span>🏆 {finishedCount}/4</span>
      </div>
    </div>
  );
}
