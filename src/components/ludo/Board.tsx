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
                background: `
                  radial-gradient(ellipse at 30% 25%, hsl(0 0% 100% / 0.25), transparent 55%),
                  linear-gradient(135deg, ${PLAYER_HEX[p]}, ${PLAYER_HEX[p]}cc)
                `,
                position: "relative",
                boxShadow: isActive
                  ? `inset 0 0 0 4px hsl(45 100% 65% / 0.85), inset 0 0 50px ${PLAYER_HEX[p]}, 0 0 30px ${PLAYER_HEX[p]}aa`
                  : `inset 0 0 0 2px hsl(45 100% 60% / 0.45), inset 0 0 30px hsl(0 0% 0% / 0.25)`,
              }}
            >
              {/* Inner embossed dark well with gold rim */}
              <div
                className="absolute inset-[12%] rounded-2xl"
                style={{
                  background: "linear-gradient(160deg, hsl(245 50% 10%), hsl(250 60% 7%))",
                  boxShadow: `
                    inset 0 0 0 3px hsl(45 100% 58%),
                    inset 0 0 0 5px ${PLAYER_HEX[p]}cc,
                    inset 0 0 28px ${PLAYER_HEX[p]}55,
                    inset 0 -4px 10px hsl(0 0% 0% / 0.5),
                    0 4px 14px hsl(0 0% 0% / 0.5)
                  `,
                }}
              />
              {playerNames?.[p] && (
                <div
                  className="absolute left-1/2 bottom-1.5 -translate-x-1/2 px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black tracking-wide whitespace-nowrap max-w-[85%] truncate z-10"
                  style={{
                    background: "hsl(0 0% 0% / 0.55)",
                    color: "hsl(0 0% 100%)",
                    backdropFilter: "blur(6px)",
                    boxShadow: `0 0 0 1px hsl(45 100% 60% / 0.7)`,
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

          let bg = "hsl(var(--tile))"; // dark base tile
          let extraStyle: React.CSSProperties = {};
          if (homeColor) {
            bg = `linear-gradient(160deg, ${PLAYER_HEX[homeColor]}, ${PLAYER_HEX[homeColor]}cc)`;
            extraStyle.boxShadow = `inset 0 0 0 1px hsl(0 0% 100% / 0.18), inset 0 -2px 0 hsl(0 0% 0% / 0.35), inset 0 0 8px ${PLAYER_HEX[homeColor]}66`;
          } else if (onMain) {
            bg = "hsl(var(--tile-path))";
            extraStyle.boxShadow = `inset 0 0 0 1px hsl(280 60% 35% / 0.55), inset 0 0 6px hsl(280 90% 65% / 0.12)`;
          } else {
            extraStyle.boxShadow = `inset 0 0 0 1px hsl(245 40% 18%)`;
          }

          return (
            <div
              key={`t-${r}-${c}`}
              className="relative"
              style={{
                gridColumn: c + 1,
                gridRow: r + 1,
                background: bg,
                ...extraStyle,
              }}
            >
              {isSafe && !homeColor && (
                <Star
                  className="absolute inset-0 m-auto h-3/5 w-3/5"
                  style={{ color: "hsl(45 100% 55%)", filter: "drop-shadow(0 0 4px hsl(45 100% 60%))" }}
                  fill="currentColor"
                  strokeWidth={1}
                />
              )}
              {isCenter && (
                <div className="absolute inset-0" style={{ background: "hsl(0 0% 0%)" }} />
              )}
              {SKIP_KEYS.has(tileKey(r, c)) && <SkipCellGlow />}
            </div>
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
                      background: `radial-gradient(circle at 50% 50%, hsl(245 50% 14%), hsl(250 60% 8%) 70%)`,
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
                    const c = PLAYER_HEX[t.player];
                    return (
                      <button
                        key={t.id}
                        onClick={() => movable && onTokenClick(t.id)}
                        disabled={!movable}
                        className={`pointer-events-auto absolute left-1/2 top-1/2 flex items-center justify-center transition-all duration-300 animate-token-pop ${
                          movable ? "cursor-pointer animate-tile-highlight" : "cursor-default"
                        } ${killed ? "animate-kill" : ""}`}
                        style={{
                          width: "78%",
                          height: "78%",
                          transform: `translate(calc(-50% + ${offset}%), calc(-50% + ${offsetY}%)) ${
                            movable ? "scale(1.08)" : ""
                          }`,
                          /* Pawn/dome 3D look matching reference picture */
                          borderRadius: "55% 55% 50% 50% / 65% 65% 35% 35%",
                          background: `
                            radial-gradient(ellipse at 32% 22%, hsl(0 0% 100% / 0.95), hsl(0 0% 100% / 0.25) 30%, transparent 55%),
                            linear-gradient(160deg, ${c}, hsl(0 0% 0% / 0.45) 110%)
                          `,
                          boxShadow: `
                            0 6px 10px hsl(0 0% 0% / 0.55),
                            0 1px 0 hsl(0 0% 100% / 0.2) inset,
                            0 -3px 6px hsl(0 0% 0% / 0.35) inset,
                            0 0 0 1.5px hsl(45 100% 60% / 0.85),
                            ${movable ? `0 0 16px ${c}, 0 0 28px ${c}88` : `0 0 6px ${c}55`}
                          `,
                          zIndex: 10 + i,
                        }}
                        aria-label={`${t.player} token`}
                      >
                        {/* Gold rim highlight */}
                        <span
                          className="absolute left-1/2 -translate-x-1/2"
                          style={{
                            bottom: "18%",
                            width: "70%",
                            height: "8%",
                            background: "linear-gradient(180deg, hsl(45 100% 75%), hsl(38 100% 50%))",
                            borderRadius: "999px",
                            boxShadow: "0 1px 0 hsl(0 0% 0% / 0.3), 0 0 6px hsl(45 100% 60% / 0.7)",
                          }}
                        />
                        {/* Top sheen */}
                        <span
                          className="absolute"
                          style={{
                            top: "12%",
                            left: "22%",
                            width: "32%",
                            height: "22%",
                            background: "radial-gradient(ellipse, hsl(0 0% 100% / 0.85), transparent 70%)",
                            borderRadius: "50%",
                            filter: "blur(0.5px)",
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
