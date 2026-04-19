import { Crown, Coins } from "lucide-react";
import { PlayerColor, PLAYER_HEX, PLAYER_LABEL } from "@/game/ludoConstants";

interface PlayerCardProps {
  color: PlayerColor;
  name: string;
  active: boolean;
  isBot?: boolean;
  isYou?: boolean;
  avatarUrl?: string | null;
  coins?: number | null;
  finishedCount: number;
  /** Mirror layout for right-side cards (label below, avatar centered same). */
  side?: "left" | "right";
}

/** Premium player card matching the reference UI: avatar with neon ring, crown for active, coin pill, color label. */
export function PlayerCard({
  color, name, active, isBot, isYou, avatarUrl, coins, finishedCount, side = "left",
}: PlayerCardProps) {
  const c = PLAYER_HEX[color];
  const initials = (name || "?").trim().slice(0, 2).toUpperCase();

  return (
    <div
      className={`player-card ${active ? "is-active" : "opacity-90"}`}
      style={{
        boxShadow: active
          ? `0 0 0 2px ${c}, 0 0 28px ${c}aa, inset 0 1px 0 hsl(0 0% 100% / 0.18)`
          : `0 0 0 1px ${c}55, inset 0 1px 0 hsl(0 0% 100% / 0.1)`,
      }}
    >
      {/* Crown for active player */}
      {active && (
        <Crown
          className="absolute -top-3 left-1/2 -translate-x-1/2 h-5 w-5 animate-crown-bob"
          style={{ color: "hsl(var(--gold))", filter: `drop-shadow(0 0 6px hsl(var(--gold)))` }}
          fill="currentColor"
        />
      )}

      <div className="flex flex-col items-center gap-1.5">
        {/* Avatar with neon ring */}
        <div
          className="relative h-14 w-14 rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${c}, ${c}99)`,
            boxShadow: `0 0 0 2px ${c}, 0 0 14px ${c}88, inset 0 0 0 2px hsl(0 0% 100% / 0.25)`,
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base font-black text-white drop-shadow">
              {initials}
            </div>
          )}
          {/* online dot */}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2"
            style={{
              background: active ? "hsl(140 75% 50%)" : "hsl(220 15% 45%)",
              borderColor: "hsl(var(--background))",
              boxShadow: active ? "0 0 8px hsl(140 75% 55%)" : undefined,
            }}
          />
        </div>

        {/* Name */}
        <p className="text-[11px] font-bold leading-tight max-w-[80px] truncate text-center">
          {isYou ? "You" : name}
          {isBot && <span className="opacity-60"> 🤖</span>}
        </p>

        {/* Coin pill */}
        {typeof coins === "number" && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black"
               style={{
                 background: "hsl(0 0% 0% / 0.4)",
                 boxShadow: "inset 0 0 0 1px hsl(45 100% 60% / 0.4)",
                 color: "hsl(45 100% 70%)",
               }}>
            <Coins className="h-3 w-3" />
            {coins.toLocaleString()}
          </div>
        )}

        {/* Color label badge */}
        <div
          className="px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider"
          style={{
            background: c,
            color: "hsl(0 0% 100%)",
            boxShadow: `0 2px 6px ${c}88, inset 0 1px 0 hsl(0 0% 100% / 0.3)`,
          }}
        >
          {PLAYER_LABEL[color]}
        </div>

        {/* Progress dots */}
        <div className="flex gap-0.5 mt-0.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: i < finishedCount ? c : "hsl(0 0% 100% / 0.15)",
                boxShadow: i < finishedCount ? `0 0 6px ${c}` : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
