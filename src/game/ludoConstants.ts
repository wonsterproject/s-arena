// Ludo game constants & path utilities
// Board is 15x15. Coordinates are [row, col], 0-indexed from top-left.

export type PlayerColor = "red" | "blue" | "green" | "yellow";

export const PLAYERS: PlayerColor[] = ["red", "blue", "green", "yellow"];

export const PLAYER_LABEL: Record<PlayerColor, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
};

// Standard Ludo main loop (52 tiles), starting at Red's start tile and going clockwise.
// Red starts at (6,1), Blue at (1,8), Green at (8,13), Yellow at (13,6).
// We define the loop as an ordered list of [row, col] cells.
export const MAIN_PATH: [number, number][] = [
  // From Red start (6,1) -> go up the left column area to (0,6), then right across top, etc.
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

// Start indices on MAIN_PATH for each player
export const START_INDEX: Record<PlayerColor, number> = {
  red: 0,    // (6,1)
  blue: 13,  // (1,8)
  green: 26, // (8,13)
  yellow: 39,// (13,6)
};

// Entry index where player leaves loop and enters home column
// Each player travels 51 steps on loop then 6 home tiles.
// Home entry = the loop index immediately BEFORE jumping to home col.
// Red enters home col after passing index (START + 50) and goes into home row.
// We handle by: position 0..50 = loop offset from start; 51..56 = home col tiles (6); 57 = center.

// 6 colored "arm" tiles leading to center. progress: 51..56 = arm tiles (last one is center-adjacent), 57 = center/finish.
export const HOME_PATHS: Record<PlayerColor, [number, number][]> = {
  red:    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  blue:   [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green:  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

export const CENTER: [number, number] = [7, 7];

// Home base (parking) positions for the 4 tokens of each player
export const HOME_BASE: Record<PlayerColor, [number, number][]> = {
  red:    [[1, 1], [1, 4], [4, 1], [4, 4]],
  blue:   [[1, 10], [1, 13], [4, 10], [4, 13]],
  green:  [[10, 10], [10, 13], [13, 10], [13, 13]],
  yellow: [[10, 1], [10, 4], [13, 1], [13, 4]],
};

// Safe star tiles (positions in MAIN_PATH coords). Includes the 4 player-start tiles + 4 stars.
export const SAFE_TILES: Set<string> = new Set(
  [
    [6, 1], [1, 8], [8, 13], [13, 6], // start tiles
    [6, 12], [2, 6], [8, 2], [12, 8], // 4 star tiles
  ].map(([r, c]) => `${r},${c}`)
);

export function tileKey(r: number, c: number) {
  return `${r},${c}`;
}

// Token position model:
// state = "base" | "active" | "home" | "finished"
// progress: 0..50 on main loop (offset from player's start), 51..56 = home column, 57 = center (finished)
export interface Token {
  id: string;
  player: PlayerColor;
  state: "base" | "active" | "finished";
  progress: number; // 0..56 only valid when active; 57 => finished
  baseSlot: number;
}

export function getTokenCell(token: Token): [number, number] {
  if (token.state === "base") {
    return HOME_BASE[token.player][token.baseSlot];
  }
  if (token.state === "finished") {
    return CENTER;
  }
  if (token.progress <= 50) {
    const idx = (START_INDEX[token.player] + token.progress) % MAIN_PATH.length;
    return MAIN_PATH[idx];
  }
  if (token.progress >= 57) {
    return CENTER;
  }
  // home column arms: progress 51..56 -> home arm index 0..5
  const homeIdx = token.progress - 51;
  return HOME_PATHS[token.player][homeIdx];
}

export function isOnSafeTile(token: Token): boolean {
  if (token.state !== "active") return false;
  if (token.progress > 50) return true; // home column is safe
  const [r, c] = getTokenCell(token);
  return SAFE_TILES.has(tileKey(r, c));
}

export const PLAYER_HEX: Record<PlayerColor, string> = {
  red: "hsl(var(--red))",
  blue: "hsl(var(--blue))",
  green: "hsl(var(--green))",
  yellow: "hsl(var(--yellow))",
};
