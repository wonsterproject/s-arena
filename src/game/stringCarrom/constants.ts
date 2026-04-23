// Sling Puck (Fast Sling Puck) — SQUARE board, 2 stacked halves with center wall + gap.
// World coords: x ∈ [-0.5, +0.5] (width), y ∈ [-0.5, +0.5] (height). Center wall at y=0.
// Player A (bottom, side 0): owns y < 0, pulls pucks DOWN to sling them UP through the gap.
// Player B (top,    side 1): owns y > 0, pulls pucks UP   to sling them DOWN through the gap.

export const BOARD = {
  halfW: 0.5,
  halfH: 0.5,
};

// Center divider wall at y=0 with a gap in the middle (x range).
export const GAP = {
  xMin: -0.075,
  xMax: 0.075,
  thickness: 0.010, // half-thickness of the wall band
};

export const PUCK = {
  radius: 0.038,
  mass: 1.0,
  restitution: 0.86,
};

export const PHYS = {
  dt: 1 / 60,
  drag: 1.55,
  rollingFriction: 0.020,
  sleepSpeed: 0.06,
  wallRestitution: 0.82,
  pMax: 11,
  pMin: 1.5,
  powerCurve: 1.30,
  maxSimSeconds: 6,
};

// Sling: each player has a virtual rubber-band anchor at their baseline (back wall).
// Anchor is positioned so the player has REAL room to pull the puck back toward the wall.
// With board half-height = 0.5 and puck radius ≈ 0.038, anchor at ±0.30 leaves ~0.16 of pull room.
export const SLING = {
  anchorYA: -0.30, // bottom player
  anchorYB:  0.30, // top player
  // Max pull distance from anchor toward baseline (in world units).
  maxPull: 0.16,
};

// Initial puck layout: 6 per side. Stagger 3 in front row, 3 in back row.
export interface PuckInit {
  id: number;
  side: 0 | 1; // 0 = bottom (white), 1 = top (black)
  x: number;
  y: number;
}

export function initialPucks(): PuckInit[] {
  const out: PuckInit[] = [];
  let id = 0;
  const xs = [-0.28, 0, 0.28];
  // Pucks must spawn IN FRONT of the sling anchor (closer to center) so player
  // can pull them back toward the band. Anchor is at ±0.30.
  // Bottom (side 0): rows at y = -0.10 (front) and y = -0.22 (back, just in front of anchor)
  for (const y of [-0.10, -0.22]) {
    for (const x of xs) {
      out.push({ id: id++, side: 0, x, y });
    }
  }
  // Top (side 1): mirrored
  for (const y of [0.10, 0.22]) {
    for (const x of xs) {
      out.push({ id: id++, side: 1, x, y });
    }
  }
  return out;
}

// (Legacy exports — kept for any stale imports; safe no-ops.)
export const DISC = PUCK;
export const STRIKER = PUCK;
export const PLACEMENT = { yMin: -0.08, yMax: 0.08, leftXMin: -0.4, leftXMax: -0.2, rightXMin: 0.2, rightXMax: 0.4 };
export const STRING_COUNT = 0;
export const STRING_Y: number[] = [];
export function stringSegments(_rowIndex: number): Array<[number, number]> { return []; }
