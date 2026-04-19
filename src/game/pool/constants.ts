// 8-Ball Pool constants. Top-down 2D simulation.
// World units: ~1 unit = 10cm. Standard 9ft table playing surface ≈ 254cm × 127cm
// → here 25.4 × 12.7 (we use 24 × 12 for clean numbers).

export const TABLE = {
  width: 24,        // X span (long side)
  height: 12,       // Z span (short side)
  halfW: 12,
  halfH: 6,
  railThickness: 0.6,
  cushionInset: 0.4, // playable area inset from rails
};

export const BALL = {
  radius: 0.32,
  mass: 1,
};

export const POCKETS: Array<{ x: number; z: number; r: number }> = [
  // 4 corners
  { x: -TABLE.halfW + 0.35, z: -TABLE.halfH + 0.35, r: 0.62 },
  { x:  TABLE.halfW - 0.35, z: -TABLE.halfH + 0.35, r: 0.62 },
  { x: -TABLE.halfW + 0.35, z:  TABLE.halfH - 0.35, r: 0.62 },
  { x:  TABLE.halfW - 0.35, z:  TABLE.halfH - 0.35, r: 0.62 },
  // 2 sides (middle of long rails)
  { x: 0, z: -TABLE.halfH + 0.25, r: 0.55 },
  { x: 0, z:  TABLE.halfH - 0.25, r: 0.55 },
];

export const PHYS = {
  friction: 0.985,        // velocity multiplier per step (60fps)
  restitution: 0.92,      // ball-ball
  cushionRestitution: 0.78,
  restThreshold: 0.02,
  maxSimSeconds: 12,
  dt: 1 / 120,            // sub-step
  maxShotSpeed: 35,       // units/sec at full power (increased 25%)
};

// Standard rack: cue ball on head spot (left), foot spot (right) for triangle apex.
export const HEAD_SPOT_X = -TABLE.halfW * 0.5;
export const FOOT_SPOT_X =  TABLE.halfW * 0.5;

export type BallKind = "cue" | "solid" | "stripe" | "eight";

export interface BallInit {
  id: number;          // 0 = cue, 1-7 = solids, 8 = eight, 9-15 = stripes
  kind: BallKind;
  x: number;
  z: number;
}

// Build standard 8-ball rack: 5 rows triangle, 8-ball in center (row 3, mid).
// Stripes/solids alternated; corners of back row must be one solid + one stripe (we approximate).
export function initialBalls(): BallInit[] {
  const balls: BallInit[] = [];
  // Cue ball
  balls.push({ id: 0, kind: "cue", x: HEAD_SPOT_X, z: 0 });

  // Triangle apex at FOOT_SPOT_X. Rows 1..5, ball spacing = 2r touching.
  const r = BALL.radius;
  const spacing = r * 2.02;
  // Build a fixed pattern of ids per slot (row, col). Standard layout:
  // Row1: 1
  // Row2: 9, 2
  // Row3: 3, 8, 10
  // Row4: 11, 4, 5, 12
  // Row5: 6, 13, 14, 7, 15
  const layout: number[][] = [
    [1],
    [9, 2],
    [3, 8, 10],
    [11, 4, 5, 12],
    [6, 13, 14, 7, 15],
  ];
  for (let row = 0; row < 5; row++) {
    const ids = layout[row];
    const x = FOOT_SPOT_X + row * spacing * Math.sqrt(3) / 2 * 1.0;
    const startZ = -((ids.length - 1) / 2) * spacing;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const kind: BallKind = id === 8 ? "eight" : id < 8 ? "solid" : "stripe";
      balls.push({ id, kind, x, z: startZ + i * spacing });
    }
  }
  return balls;
}

export const BALL_COLORS: Record<number, string> = {
  0: "#ffffff",
  1: "#f5d000",  // yellow solid
  2: "#1f4ed8",  // blue solid
  3: "#dc2626",  // red solid
  4: "#7c3aed",  // purple solid
  5: "#ea580c",  // orange solid
  6: "#15803d",  // green solid
  7: "#7f1d1d",  // maroon solid
  8: "#0a0a0a",  // black 8
  9: "#f5d000",  // yellow stripe
  10: "#1f4ed8",
  11: "#dc2626",
  12: "#7c3aed",
  13: "#ea580c",
  14: "#15803d",
  15: "#7f1d1d",
};
