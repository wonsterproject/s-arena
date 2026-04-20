import { ReactNode } from "react";
import {
  HOME_BASE,
  HOME_PATHS,
  MAIN_PATH,
  PLAYER_HEX,
  PlayerColor,
  PLAYERS,
  SAFE_TILES,
  START_INDEX,
  Token,
  getTokenCell,
  tileKey,
} from "@/game/ludoConstants";
import boardBg from "@/assets/ludo-board-realistic.png";

export type BoardTheme = "realistic" | "classic";

interface BoardProps {
  tokens: Token[];
  currentPlayer: PlayerColor;
  movableTokenIds: Set<string>;
  onTokenClick: (id: string) => void;
  killedTokenIds: Set<string>;
  centerContent?: ReactNode;
  playerNames?: Partial<Record<PlayerColor, string>>;
  theme?: BoardTheme;
}

const SIZE = 15;

const QUADRANT: Record<PlayerColor, { rows: [number, number]; cols: [number, number] }> = {
  red:    { rows: [0, 5], cols: [0, 5] },
  blue:   { rows: [0, 5], cols: [9, 14] },
  green:  { rows: [9, 14], cols: [9, 14] },
  yellow: { rows: [9, 14], cols: [0, 5] },
};

/**
 * Board now uses the realistic 3D coal+glass+stone background image
 * (mounted via LavaBackground). The board itself is a transparent grid
 * that simply positions tokens, the active-player highlight, the dice
 * area and clickable hitboxes on top of the image.
 */
export function Board({
  tokens,
  currentPlayer,
  movableTokenIds,
  onTokenClick,
  killedTokenIds,
  centerContent,
  playerNames,
  theme = "realistic",
}: BoardProps) {
  const cellMap = new Map<string, Token[]>();
  tokens.forEach((t) => {
    const [r, c] = getTokenCell(t);
    const k = tileKey(r, c);
    const arr = cellMap.get(k) ?? [];
    arr.push(t);
    cellMap.set(k, arr);
  });

  const isClassic = theme === "classic";

  return (
    <div className="aspect-square w-full max-w-[760px] relative" role="grid" aria-label="Ludo board">
      {/* Realistic 3D coal+glass+stone board image — exact reference */}
      {!isClassic && (
        <img
          src={boardBg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover rounded-[1.4rem] select-none pointer-events-none"
          draggable={false}
          style={{ filter: "saturate(1.08) contrast(1.04)" }}
        />
      )}
      {/* Classic theme: clean colorful ludo board built with CSS */}
      {isClassic && <ClassicBoardBackground />}
      {/* Live ember/heat overlay sits inside the board too — only realistic */}
      {!isClassic && (
        <div
          className="absolute inset-0 rounded-[1.4rem] pointer-events-none animate-board-heat"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, hsl(20 90% 40% / 0.15), transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
      )}
      <div
        className="relative grid h-full w-full overflow-hidden rounded-[1.4rem]"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
        }}
      >
        {/* Active-player home zone glow ring (subtle pulsing highlight on top of image) */}
        {PLAYERS.map((p) => {
          const q = QUADRANT[p];
          const isActive = p === currentPlayer;
          return (
            <div
              key={`q-${p}`}
              className={`pointer-events-none relative ${isActive ? "animate-lava-pulse" : ""}`}
              style={{
                gridColumn: `${q.cols[0] + 1} / span 6`,
                gridRow: `${q.rows[0] + 1} / span 6`,
                boxShadow: isActive
                  ? `inset 0 0 0 4px hsl(45 100% 65% / 0.85), inset 0 0 50px ${PLAYER_HEX[p]}aa, 0 0 30px ${PLAYER_HEX[p]}88`
                  : "none",
                borderRadius: "12px",
              }}
            >
              {playerNames?.[p] && (
                <div
                  className="absolute left-1/2 bottom-1.5 -translate-x-1/2 px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black tracking-wide whitespace-nowrap max-w-[85%] truncate z-10"
                  style={{
                    background: "hsl(0 0% 0% / 0.7)",
                    color: "hsl(0 0% 100%)",
                    boxShadow: `0 0 0 1px hsl(45 100% 60% / 0.7), 0 0 12px hsl(0 0% 0% / 0.6)`,
                  }}
                >
                  {playerNames[p]}
                </div>
              )}
            </div>
          );
        })}

        {/* Center content (dice) */}
        <div
          className="pointer-events-auto relative flex items-center justify-center z-20"
          style={{ gridColumn: "7 / span 3", gridRow: "7 / span 3" }}
        >
          {centerContent ?? <div className="text-2xl font-black text-glow opacity-90">★</div>}
        </div>

        {/* Tokens overlay */}
        <div className="pointer-events-none absolute inset-0">
          {/* Home base parking slots — subtle dark wells so tokens read on glass */}
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${SIZE}, 1fr)`,
            }}
          >
            {PLAYERS.flatMap((p) =>
              HOME_BASE[p].map(([r, c], i) => (
                <div
                  key={`base-${p}-${i}`}
                  className="flex items-center justify-center"
                  style={{ gridColumn: c + 1, gridRow: r + 1 }}
                >
                  <div
                    className="h-[78%] w-[78%] rounded-full"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, hsl(0 0% 0% / 0.55), hsl(0 0% 0% / 0.85) 75%)`,
                      boxShadow: `inset 0 0 0 2px ${PLAYER_HEX[p]}cc, inset 0 -3px 6px hsl(0 0% 0% / 0.7), 0 0 10px ${PLAYER_HEX[p]}77`,
                    }}
                  />
                </div>
              ))
            )}
          </div>

          {Array.from(cellMap.entries()).map(([key, group]) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <div
                key={`cell-${key}`}
                className="absolute flex items-center justify-center"
                style={{
                  left: `${(c / SIZE) * 100}%`,
                  top: `${(r / SIZE) * 100}%`,
                  width: `${100 / SIZE}%`,
                  height: `${100 / SIZE}%`,
                }}
              >
                <div className="relative h-full w-full">
                  {group.map((t, i) => {
                    const movable = movableTokenIds.has(t.id);
                    const killed = killedTokenIds.has(t.id);
                    const offset = group.length > 1 ? (i - (group.length - 1) / 2) * 18 : 0;
                    const offsetY = group.length > 1 ? (i % 2 === 0 ? -4 : 4) : 0;
                    const c2 = PLAYER_HEX[t.player];
                    return (
                      <button
                        key={t.id}
                        onClick={() => movable && onTokenClick(t.id)}
                        disabled={!movable}
                        className={`pointer-events-auto absolute left-1/2 top-1/2 transition-all duration-300 animate-token-pop ${
                          movable ? "cursor-pointer animate-tile-highlight" : "cursor-default"
                        } ${killed ? "animate-kill" : ""}`}
                        style={{
                          width: "85%",
                          height: "100%",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          transform: `translate(calc(-50% + ${offset}%), calc(-50% + ${offsetY}% - 8%)) ${
                            movable ? "scale(1.08)" : ""
                          }`,
                          filter: movable
                            ? `drop-shadow(0 0 12px ${c2}) drop-shadow(0 4px 6px hsl(0 0% 0% / 0.7))`
                            : `drop-shadow(0 3px 5px hsl(0 0% 0% / 0.65))`,
                          zIndex: 10 + i,
                        }}
                        aria-label={`${t.player} token`}
                      >
                        <PawnSVG color={c2} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PawnSVG({ color }: { color: string }) {
  const uid = `pwn-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg viewBox="0 0 100 130" className="block h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id={`${uid}-dome`} cx="38%" cy="30%" r="70%">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" stopOpacity="0.95" />
          <stop offset="22%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor="hsl(0 0% 0%)" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="55%" stopColor={color} />
          <stop offset="100%" stopColor="hsl(0 0% 0%)" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(45 100% 80%)" />
          <stop offset="50%" stopColor="hsl(42 100% 58%)" />
          <stop offset="100%" stopColor="hsl(32 95% 38%)" />
        </linearGradient>
        <radialGradient id={`${uid}-base`} cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor={color} />
          <stop offset="70%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor="hsl(0 0% 0%)" stopOpacity="0.7" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="122" rx="34" ry="5" fill="hsl(0 0% 0%)" opacity="0.45" />
      <ellipse cx="50" cy="110" rx="38" ry="11" fill={`url(#${uid}-base)`} stroke={`url(#${uid}-gold)`} strokeWidth="2" />
      <ellipse cx="50" cy="103" rx="34" ry="6" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="2.2" />
      <path d="M 30 102 C 30 90, 22 78, 32 62 L 68 62 C 78 78, 70 90, 70 102 Z" fill={`url(#${uid}-body)`} />
      <ellipse cx="50" cy="58" rx="22" ry="5" fill={`url(#${uid}-gold)`} stroke="hsl(30 80% 25%)" strokeWidth="0.8" />
      <ellipse cx="50" cy="38" rx="24" ry="26" fill={`url(#${uid}-dome)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.6" />
      <ellipse cx="42" cy="26" rx="10" ry="6" fill="hsl(0 0% 100%)" opacity="0.7" />
      <ellipse cx="38" cy="22" rx="4" ry="2.5" fill="hsl(0 0% 100%)" opacity="0.95" />
      <path d="M 34 100 C 30 88, 26 78, 34 64" stroke="hsl(0 0% 100%)" strokeOpacity="0.35" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Classic Ludo board background — clean, colorful, the original look.
 * Pure CSS/SVG, no realistic image. Recreates the four corner home
 * quadrants, the cross paths and the colored center triangles.
 */
function ClassicBoardBackground() {
  const colors: Record<PlayerColor, string> = {
    red: PLAYER_HEX.red,
    blue: PLAYER_HEX.blue,
    green: PLAYER_HEX.green,
    yellow: PLAYER_HEX.yellow,
  };
  return (
    <div
      className="absolute inset-0 rounded-[1.4rem] overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(220 25% 14%), hsl(225 30% 9%))",
        boxShadow: "inset 0 0 0 2px hsl(45 90% 55% / 0.4), 0 12px 40px hsl(0 0% 0% / 0.5)",
      }}
    >
      {([
        { color: colors.red,    style: { top: 0, left: 0 } as const },
        { color: colors.blue,   style: { top: 0, right: 0 } as const },
        { color: colors.yellow, style: { bottom: 0, left: 0 } as const },
        { color: colors.green,  style: { bottom: 0, right: 0 } as const },
      ]).map((q, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: `${(6 / SIZE) * 100}%`,
            height: `${(6 / SIZE) * 100}%`,
            background: `linear-gradient(135deg, ${q.color}, ${q.color}cc)`,
            boxShadow: `inset 0 0 0 3px hsl(0 0% 100% / 0.25), inset 0 0 30px hsl(0 0% 0% / 0.35)`,
            ...q.style,
          }}
        >
          <div
            className="absolute rounded-md"
            style={{
              inset: "14%",
              background: "hsl(0 0% 98%)",
              boxShadow: "inset 0 0 0 2px hsl(0 0% 0% / 0.15)",
            }}
          />
        </div>
      ))}

      {/* Center 3x3 with 4 colored triangles */}
      <div
        className="absolute"
        style={{
          left: `${(6 / SIZE) * 100}%`,
          top: `${(6 / SIZE) * 100}%`,
          width: `${(3 / SIZE) * 100}%`,
          height: `${(3 / SIZE) * 100}%`,
          background: "hsl(0 0% 98%)",
          boxShadow: "inset 0 0 0 2px hsl(0 0% 0% / 0.2)",
        }}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <polygon points="0,0 100,0 50,50" fill={colors.blue} />
          <polygon points="100,0 100,100 50,50" fill={colors.green} />
          <polygon points="100,100 0,100 50,50" fill={colors.yellow} />
          <polygon points="0,100 0,0 50,50" fill={colors.red} />
        </svg>
      </div>

      {/* PathGrid renders all path tiles including colored home-column arms */}
      <PathGrid />
    </div>
  );
}

function PathGrid() {
  // Build per-cell color/role map
  const cellInfo = new Map<string, { bg: string; star?: boolean; arrowColor?: string }>();

  // 1) Plain white path cells across the cross
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const isCol = c >= 6 && c <= 8;
      const isRow = r >= 6 && r <= 8;
      const inHome = (r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c < 6) || (r > 8 && c > 8);
      const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;
      if ((isCol || isRow) && !inHome && !inCenter) {
        cellInfo.set(`${r},${c}`, { bg: "hsl(0 0% 98%)" });
      }
    }
  }

  // 2) Color the home-column (winning) tiles for each player
  PLAYERS.forEach((p) => {
    HOME_PATHS[p].forEach(([r, c]) => {
      cellInfo.set(`${r},${c}`, { bg: PLAYER_HEX[p] });
    });
  });

  // 3) Mark safe tiles with star
  SAFE_TILES.forEach((k) => {
    const info = cellInfo.get(k);
    if (info) info.star = true;
  });

  // 4) Mark each player's start tile with their color tint + arrow
  PLAYERS.forEach((p) => {
    const [r, c] = MAIN_PATH[START_INDEX[p]];
    const k = `${r},${c}`;
    const info = cellInfo.get(k);
    if (info) {
      info.bg = `${PLAYER_HEX[p]}`;
      info.arrowColor = "hsl(0 0% 100%)";
    }
  });

  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from(cellInfo.entries()).map(([key, info]) => {
        const [r, c] = key.split(",").map(Number);
        return (
          <div
            key={`p-${key}`}
            className="absolute flex items-center justify-center"
            style={{
              top: `${(r / SIZE) * 100}%`,
              left: `${(c / SIZE) * 100}%`,
              width: `${(1 / SIZE) * 100}%`,
              height: `${(1 / SIZE) * 100}%`,
              background: info.bg,
              boxShadow: "inset 0 0 0 1px hsl(0 0% 0% / 0.22)",
            }}
          >
            {info.star && (
              <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" aria-hidden>
                <polygon
                  points="12,2 14.6,9 22,9 16,13.5 18.2,21 12,16.5 5.8,21 8,13.5 2,9 9.4,9"
                  fill="hsl(0 0% 0% / 0.55)"
                  stroke="hsl(0 0% 0% / 0.7)"
                  strokeWidth="0.6"
                />
              </svg>
            )}
            {info.arrowColor && !info.star && (
              <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" aria-hidden>
                <polygon points="4,12 14,5 14,9 20,9 20,15 14,15 14,19" fill={info.arrowColor} stroke="hsl(0 0% 0% / 0.4)" strokeWidth="0.5" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
