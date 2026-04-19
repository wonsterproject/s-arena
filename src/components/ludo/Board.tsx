import { Star } from "lucide-react";
import { ReactNode } from "react";
import {
  CENTER,
  HOME_BASE,
  HOME_PATHS,
  MAIN_PATH,
  PLAYER_HEX,
  PlayerColor,
  PLAYERS,
  SAFE_TILES,
  Token,
  getTokenCell,
  tileKey,
} from "@/game/ludoConstants";
import { BoardSVGDefs, stoneVariant } from "./BoardTextures";

interface BoardProps {
  tokens: Token[];
  currentPlayer: PlayerColor;
  movableTokenIds: Set<string>;
  onTokenClick: (id: string) => void;
  killedTokenIds: Set<string>;
  centerContent?: ReactNode;
  playerNames?: Partial<Record<PlayerColor, string>>;
}

const SIZE = 15;

const SKIP_CELLS: [number, number][] = [
  [6, 6], [6, 8], [8, 6], [8, 8],
];
const SKIP_KEYS = new Set(SKIP_CELLS.map(([r, c]) => `${r},${c}`));

const QUADRANT: Record<PlayerColor, { rows: [number, number]; cols: [number, number] }> = {
  red:    { rows: [0, 5], cols: [0, 5] },
  blue:   { rows: [0, 5], cols: [9, 14] },
  green:  { rows: [9, 14], cols: [9, 14] },
  yellow: { rows: [9, 14], cols: [0, 5] },
};

function isMainPathCell(r: number, c: number): boolean {
  return MAIN_PATH.some(([rr, cc]) => rr === r && cc === c);
}

function homeColorOfCell(r: number, c: number): PlayerColor | null {
  for (const p of PLAYERS) {
    if (HOME_PATHS[p].some(([rr, cc]) => rr === r && cc === c)) return p;
  }
  return null;
}

export function Board({
  tokens,
  currentPlayer,
  movableTokenIds,
  onTokenClick,
  killedTokenIds,
  centerContent,
  playerNames,
}: BoardProps) {
  const cellMap = new Map<string, Token[]>();
  tokens.forEach((t) => {
    const [r, c] = getTokenCell(t);
    const k = tileKey(r, c);
    const arr = cellMap.get(k) ?? [];
    arr.push(t);
    cellMap.set(k, arr);
  });

  return (
    <div className="rainbow-frame aspect-square w-full max-w-[760px]" role="grid" aria-label="Ludo board">
      <BoardSVGDefs />
      <div
        className="relative grid h-full w-full overflow-hidden rounded-[1.4rem] animate-board-heat"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
          gap: "1px",
          background: "hsl(20 25% 4%)",
        }}
      >
        {/* ---------- SHATTERED GEMSTONE QUADRANTS ---------- */}
        {PLAYERS.map((p) => {
          const q = QUADRANT[p];
          const isActive = p === currentPlayer;
          return (
            <div
              key={`q-${p}`}
              className="pointer-events-none relative animate-gem-shimmer"
              style={{
                gridColumn: `${q.cols[0] + 1} / span 6`,
                gridRow: `${q.rows[0] + 1} / span 6`,
                boxShadow: isActive
                  ? `inset 0 0 0 3px hsl(45 100% 65% / 0.95), inset 0 0 60px ${PLAYER_HEX[p]}, 0 0 36px ${PLAYER_HEX[p]}cc`
                  : `inset 0 0 0 2px hsl(45 100% 60% / 0.55), inset 0 0 30px hsl(0 0% 0% / 0.4)`,
              }}
            >
              {/* shattered gemstone fill */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                <use href={`#shatter-${p}`} width="100" height="100" />
              </svg>
              {/* lava-glow leaking through cracks */}
              <div
                className="absolute inset-0 pointer-events-none mix-blend-screen animate-lava-pulse"
                style={{
                  background: `radial-gradient(ellipse at 50% 50%, ${PLAYER_HEX[p]}33, transparent 70%)`,
                }}
              />
              {/* dark inner well so home bases sit on a solid base */}
              <div
                className="absolute inset-[12%] rounded-2xl"
                style={{
                  background:
                    "linear-gradient(160deg, hsl(15 35% 6% / 0.95), hsl(0 50% 4% / 0.98))",
                  boxShadow: `
                    inset 0 0 0 3px hsl(45 100% 58%),
                    inset 0 0 0 5px ${PLAYER_HEX[p]}cc,
                    inset 0 0 28px ${PLAYER_HEX[p]}55,
                    inset 0 -4px 10px hsl(0 0% 0% / 0.6),
                    0 4px 14px hsl(0 0% 0% / 0.5)
                  `,
                }}
              />
              {playerNames?.[p] && (
                <div
                  className="absolute left-1/2 bottom-1.5 -translate-x-1/2 px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black tracking-wide whitespace-nowrap max-w-[85%] truncate z-10"
                  style={{
                    background: "hsl(0 0% 0% / 0.65)",
                    color: "hsl(0 0% 100%)",
                    boxShadow: `0 0 0 1px hsl(45 100% 60% / 0.7)`,
                  }}
                >
                  {playerNames[p]}
                </div>
              )}
            </div>
          );
        })}

        {/* ---------- TILES ---------- */}
        {Array.from({ length: SIZE * SIZE }).map((_, idx) => {
          const r = Math.floor(idx / SIZE);
          const c = idx % SIZE;
          const onMain = isMainPathCell(r, c);
          const homeColor = homeColorOfCell(r, c);
          const isCenter = r === CENTER[0] && c === CENTER[1];
          const isSafe = SAFE_TILES.has(tileKey(r, c));

          const inQuadrant = PLAYERS.some((p) => {
            const q = QUADRANT[p];
            return r >= q.rows[0] && r <= q.rows[1] && c >= q.cols[0] && c <= q.cols[1];
          });
          if (inQuadrant) return null;
          if (isCenter) {
            return (
              <div
                key={`t-${r}-${c}`}
                style={{ gridColumn: c + 1, gridRow: r + 1, background: "hsl(0 0% 0%)" }}
              />
            );
          }

          // colored gem arm tile
          if (homeColor) {
            return (
              <div
                key={`t-${r}-${c}`}
                className="relative animate-gem-shimmer"
                style={{ gridColumn: c + 1, gridRow: r + 1 }}
              >
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full"
                  style={{
                    filter: `drop-shadow(0 0 4px ${PLAYER_HEX[homeColor]}88)`,
                  }}
                >
                  <use href={`#gem-${homeColor}`} width="100" height="100" />
                </svg>
                {/* lava reflection through gem */}
                <div
                  className="absolute inset-0 pointer-events-none mix-blend-overlay animate-lava-pulse"
                  style={{
                    background: `linear-gradient(135deg, ${PLAYER_HEX[homeColor]}55, transparent 60%)`,
                  }}
                />
              </div>
            );
          }

          // path tile or neutral — broken stone
          if (onMain) {
            const variant = stoneVariant(r, c);
            return (
              <div
                key={`t-${r}-${c}`}
                className="relative"
                style={{ gridColumn: c + 1, gridRow: r + 1 }}
              >
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full w-full"
                >
                  <use href={`#${variant}`} width="100" height="100" />
                </svg>
                {/* faint lava glow leak through cracks */}
                <div
                  className="absolute inset-0 pointer-events-none mix-blend-screen animate-lava-pulse"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 60%, hsl(20 95% 50% / 0.18), transparent 70%)",
                  }}
                />
                {isSafe && (
                  <Star
                    className="absolute inset-0 m-auto h-3/5 w-3/5 z-[2]"
                    style={{
                      color: "hsl(45 100% 58%)",
                      filter: "drop-shadow(0 0 5px hsl(45 100% 60%))",
                    }}
                    fill="currentColor"
                    strokeWidth={1}
                  />
                )}
                {SKIP_KEYS.has(tileKey(r, c)) && <SkipCellGlow />}
              </div>
            );
          }

          // off-path filler in cross arms (shouldn't usually exist but safe fallback)
          return (
            <div
              key={`t-${r}-${c}`}
              style={{
                gridColumn: c + 1,
                gridRow: r + 1,
                background: "hsl(0 0% 0% / 0.4)",
              }}
            />
          );
        })}

        {/* Center star-burst rays */}
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${(6 / SIZE) * 100}%`,
            top: `${(6 / SIZE) * 100}%`,
            width: `${(3 / SIZE) * 100}%`,
            height: `${(3 / SIZE) * 100}%`,
            zIndex: 5,
          }}
        >
          <div
            className="absolute inset-0 animate-center-rays"
            style={{
              background: `conic-gradient(from 0deg,
                hsl(0 90% 60% / 0.55) 0deg, transparent 45deg,
                hsl(45 100% 55% / 0.55) 90deg, transparent 135deg,
                hsl(140 75% 50% / 0.55) 180deg, transparent 225deg,
                hsl(215 95% 60% / 0.55) 270deg, transparent 315deg)`,
              borderRadius: "50%",
              filter: "blur(8px)",
            }}
          />
        </div>

        {/* Center content (dice / decoration) */}
        <div
          className="pointer-events-auto relative flex items-center justify-center z-20"
          style={{ gridColumn: "7 / span 3", gridRow: "7 / span 3" }}
        >
          {centerContent ?? <div className="text-2xl font-black text-glow opacity-90">★</div>}
        </div>

        {/* Tokens overlay */}
        <div className="pointer-events-none absolute inset-0">
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
                    className="h-[80%] w-[80%] rounded-full"
                    style={{
                      background: `radial-gradient(circle at 50% 50%, hsl(15 35% 8%), hsl(0 50% 4%) 70%)`,
                      boxShadow: `inset 0 0 0 2px ${PLAYER_HEX[p]}, inset 0 -3px 6px hsl(0 0% 0% / 0.6), inset 0 0 10px ${PLAYER_HEX[p]}55, 0 0 8px ${PLAYER_HEX[p]}55`,
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
                            ? `drop-shadow(0 0 10px ${c2}) drop-shadow(0 4px 6px hsl(0 0% 0% / 0.6))`
                            : `drop-shadow(0 3px 4px hsl(0 0% 0% / 0.55))`,
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

function SkipCellGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden animate-skip-pulse">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, hsl(var(--red) / 0.3), transparent 70%)",
        }}
      />
      <span
        className="absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full animate-skip-orb"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, hsl(0 0% 100% / 0.95), hsl(var(--red)) 55%, hsl(var(--red) / 0.2) 90%)",
          boxShadow:
            "0 0 10px hsl(var(--red)), 0 0 22px hsl(var(--red) / 0.85), 0 0 38px hsl(var(--red) / 0.5)",
          filter: "saturate(1.4)",
        }}
      />
      <span
        className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full animate-skip-orb"
        style={{
          animationDelay: "-1.4s",
          background:
            "radial-gradient(circle at 40% 35%, hsl(0 0% 100% / 0.9), hsl(var(--red)) 60%)",
          boxShadow: "0 0 8px hsl(var(--red)), 0 0 16px hsl(var(--red) / 0.9)",
        }}
      />
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
