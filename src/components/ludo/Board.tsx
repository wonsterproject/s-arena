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

interface BoardProps {
  tokens: Token[];
  currentPlayer: PlayerColor;
  movableTokenIds: Set<string>;
  onTokenClick: (id: string) => void;
  killedTokenIds: Set<string>;
  /** Optional content rendered in the central 3x3 zone (e.g. dice). */
  centerContent?: ReactNode;
  /** Optional username overlays on each home base quadrant. */
  playerNames?: Partial<Record<PlayerColor, string>>;
}

const SIZE = 15;

// Cells that the path "skips" (diagonal corner turns). Decorated with neon red floating lights.
const SKIP_CELLS: [number, number][] = [
  [6, 6],
  [6, 8],
  [8, 6],
  [8, 8],
];
const SKIP_KEYS = new Set(SKIP_CELLS.map(([r, c]) => `${r},${c}`));

const QUADRANT: Record<PlayerColor, { area: string; rows: [number, number]; cols: [number, number] }> = {
  red:    { area: "red",    rows: [0, 5], cols: [0, 5] },
  blue:   { area: "blue",   rows: [0, 5], cols: [9, 14] },
  green:  { area: "green",  rows: [9, 14], cols: [9, 14] },
  yellow: { area: "yellow", rows: [9, 14], cols: [0, 5] },
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

export function Board({ tokens, currentPlayer, movableTokenIds, onTokenClick, killedTokenIds, centerContent, playerNames }: BoardProps) {
  const cellMap = new Map<string, Token[]>();
  tokens.forEach((t) => {
    const [r, c] = getTokenCell(t);
    const k = tileKey(r, c);
    const arr = cellMap.get(k) ?? [];
    arr.push(t);
    cellMap.set(k, arr);
  });

  return (
    <div
      className="rainbow-frame aspect-square w-full max-w-[760px]"
      role="grid"
      aria-label="Ludo board"
    >
      <div
        className="relative grid h-full w-full overflow-hidden rounded-[1.4rem]"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
          gap: "1px",
          background: "hsl(var(--tile-line))",
        }}
      >
        {/* Quadrant home areas */}
        {PLAYERS.map((p) => {
          const q = QUADRANT[p];
          const isActive = p === currentPlayer;
          return (
            <div
              key={`q-${p}`}
              className="pointer-events-none"
              style={{
                gridColumn: `${q.cols[0] + 1} / span 6`,
                gridRow: `${q.rows[0] + 1} / span 6`,
                background: `linear-gradient(135deg, ${PLAYER_HEX[p]}, ${PLAYER_HEX[p]}cc)`,
                position: "relative",
                boxShadow: isActive ? `inset 0 0 0 4px hsl(0 0% 100% / 0.55), inset 0 0 40px ${PLAYER_HEX[p]}` : undefined,
              }}
            >
              <div
                className="absolute inset-[14%] rounded-xl"
                style={{
                  background: "hsl(var(--board))",
                  boxShadow: `inset 0 0 0 2px ${PLAYER_HEX[p]}`,
                }}
              />
              {playerNames?.[p] && (
                <div
                  className="absolute left-1/2 top-2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-black tracking-wide whitespace-nowrap max-w-[90%] truncate"
                  style={{
                    background: "hsl(var(--background) / 0.7)",
                    color: PLAYER_HEX[p],
                    backdropFilter: "blur(6px)",
                    boxShadow: `0 0 0 1px ${PLAYER_HEX[p]}55`,
                  }}
                >
                  {playerNames[p]}
                </div>
              )}
            </div>
          );
        })}

        {/* Tiles */}
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

          let bg = "hsl(var(--tile))";
          if (homeColor) {
            bg = `${PLAYER_HEX[homeColor]}`;
          } else if (onMain) {
            bg = "hsl(230 18% 17%)";
          }

          return (
            <div
              key={`t-${r}-${c}`}
              className="relative"
              style={{
                gridColumn: c + 1,
                gridRow: r + 1,
                background: bg,
              }}
            >
              {isSafe && !homeColor && (
                <Star
                  className="absolute inset-0 m-auto h-3/5 w-3/5 opacity-60"
                  style={{ color: "hsl(var(--accent))" }}
                  fill="currentColor"
                  strokeWidth={1}
                />
              )}
              {isCenter && (
                <div
                  className="absolute inset-0"
                  style={{ background: "hsl(0 0% 0%)" }}
                />
              )}
              {SKIP_KEYS.has(tileKey(r, c)) && <SkipCellGlow />}
            </div>
          );
        })}

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
                    className="h-[78%] w-[78%] rounded-full"
                    style={{
                      background: "hsl(var(--board))",
                      boxShadow: `inset 0 0 0 2px ${PLAYER_HEX[p]}aa`,
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
                    return (
                      <button
                        key={t.id}
                        onClick={() => movable && onTokenClick(t.id)}
                        disabled={!movable}
                        className={`pointer-events-auto absolute left-1/2 top-1/2 flex items-center justify-center rounded-full transition-all duration-300 animate-token-pop ${
                          movable ? "cursor-pointer animate-tile-highlight" : "cursor-default"
                        } ${killed ? "animate-kill" : ""}`}
                        style={{
                          width: "70%",
                          height: "70%",
                          transform: `translate(calc(-50% + ${offset}%), calc(-50% + ${offsetY}%)) ${
                            movable ? "scale(1.05)" : ""
                          }`,
                          background: `radial-gradient(circle at 30% 25%, hsl(0 0% 100% / 0.8), ${PLAYER_HEX[t.player]} 60%)`,
                          boxShadow: `0 4px 10px hsl(0 0% 0% / 0.5), 0 0 0 2px hsl(0 0% 100% / 0.2) inset, ${
                            movable ? `0 0 14px ${PLAYER_HEX[t.player]}` : ""
                          }`,
                          zIndex: 10 + i,
                        }}
                        aria-label={`${t.player} token`}
                      >
                        <span
                          className="block rounded-full"
                          style={{
                            width: "30%",
                            height: "30%",
                            background: "hsl(0 0% 100% / 0.55)",
                          }}
                        />
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

/** Decorative neon-red glow + floating orbs for the 4 "skipped" corner cells. */
function SkipCellGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden animate-skip-pulse">
      {/* Soft red wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, hsl(var(--red) / 0.22), transparent 70%)",
        }}
      />
      {/* Two floating neon orbs at offset phases */}
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
          boxShadow:
            "0 0 8px hsl(var(--red)), 0 0 16px hsl(var(--red) / 0.9)",
        }}
      />
    </div>
  );
}
