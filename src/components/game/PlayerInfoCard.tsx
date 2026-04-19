import { User } from "lucide-react";

interface Stat {
  icon: React.ReactNode;
  value: number | string;
}

interface Props {
  name: string;
  isActive: boolean;
  isYou?: boolean;
  avatarLetter?: string;
  stats: Stat[];
  badge?: string; // e.g. "Solids" / "Stripes"
  badgeColor?: string;
  align?: "left" | "right";
}

/**
 * Premium player card — circular avatar (placeholder), name, stat chips,
 * "Your Turn" pill that lights up when active.
 */
export default function PlayerInfoCard({
  name,
  isActive,
  isYou,
  avatarLetter,
  stats,
  badge,
  badgeColor,
  align = "left",
}: Props) {
  return (
    <div
      className="relative rounded-2xl p-2.5 sm:p-3 transition"
      style={{
        background:
          "linear-gradient(180deg, hsl(232 50% 16% / 0.95), hsl(232 55% 9% / 0.95))",
        boxShadow: isActive
          ? "0 0 0 2px hsl(215 95% 60%) inset, 0 0 18px hsl(215 95% 60% / 0.5), 0 6px 16px rgba(0,0,0,0.5)"
          : "0 0 0 1.5px hsl(232 50% 30%) inset, 0 6px 14px rgba(0,0,0,0.45)",
      }}
    >
      <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
        {/* Avatar */}
        <div
          className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center shrink-0 ring-2 ring-indigo-300/40 shadow-lg overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, hsl(215 80% 55%), hsl(260 70% 45%))",
          }}
        >
          {avatarLetter ? (
            <span className="text-xl font-black text-white drop-shadow">{avatarLetter}</span>
          ) : (
            <User className="h-6 w-6 text-white/90" />
          )}
        </div>

        {/* Name + stats */}
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
            <span className="text-sm sm:text-base font-black text-white truncate">{name}</span>
            {isActive && (
              <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_8px_hsl(140_75%_55%)]" />
            )}
          </div>
          <div className={`flex items-center gap-2 mt-1 ${align === "right" ? "justify-end" : ""}`}>
            {stats.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/30 text-[11px] font-bold text-indigo-100"
              >
                <span>{s.icon}</span>
                <span>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom pill: badge or "Your Turn" */}
      {(isActive || badge) && (
        <div className={`mt-2 flex ${align === "right" ? "justify-end" : "justify-start"}`}>
          {isActive && isYou ? (
            <div
              className="px-3 py-0.5 rounded-full text-[11px] font-black text-white"
              style={{
                background: "linear-gradient(180deg, hsl(215 95% 55%), hsl(225 85% 42%))",
                boxShadow: "0 2px 6px hsl(215 95% 55% / 0.5)",
              }}
            >
              Your Turn
            </div>
          ) : badge ? (
            <div
              className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider"
              style={{
                background: badgeColor ?? "hsl(232 50% 30%)",
                color: "white",
              }}
            >
              {badge}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
