// Carrom dimensions in "world units" (1 unit ~ 1cm for intuition; board ~73cm playable)
export const BOARD = {
  size: 7.4,             // playable square half-width = 3.7
  half: 3.7,
  thickness: 0.4,
  pocketRadius: 0.32,
  baselineY: 2.4,        // striker placement y (per side)
  baselineHalfWidth: 2.2,
};

export const PIECE = {
  radius: 0.18,
  height: 0.08,
  mass: 0.005,           // ~5g coin
};

export const STRIKER = {
  radius: 0.22,
  height: 0.09,
  mass: 0.015,           // 15g striker
};

export const PHYS = {
  friction: 0.05,        // low surface friction — sliding feels glassy
  restitution: 0.55,     // wall bounce
  pieceLinearDamping: 0.32,
  pieceAngularDamping: 0.4,
  strikerLinearDamping: 0.30,
  maxShotImpulse: 0.45,  // tuned with mass for proportional energy transfer
  restThreshold: 0.05,
  maxSimSeconds: 8,
};

export const POCKETS: Array<[number, number]> = [
  [-BOARD.half + 0.25, -BOARD.half + 0.25],
  [ BOARD.half - 0.25, -BOARD.half + 0.25],
  [-BOARD.half + 0.25,  BOARD.half - 0.25],
  [ BOARD.half - 0.25,  BOARD.half - 0.25],
];

export type PieceColor = "white" | "black" | "queen";

export interface PieceInit {
  id: string;
  color: PieceColor;
  x: number;
  z: number;
}

// Standard carrom layout: queen center, surrounded by alternating ring of 6,
// then outer ring of 12 alternating. Total: 1 queen + 9 white + 9 black.
export function initialPieces(): PieceInit[] {
  const pieces: PieceInit[] = [];
  const r = PIECE.radius * 2.05; // touch spacing
  pieces.push({ id: "q", color: "queen", x: 0, z: 0 });

  // Inner hex ring of 6 (alternating)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pieces.push({
      id: `i${i}`,
      color: i % 2 === 0 ? "white" : "black",
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
    });
  }
  // Outer ring of 12 (alternating, offset)
  const r2 = r * 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    pieces.push({
      id: `o${i}`,
      color: i % 2 === 0 ? "black" : "white",
      x: Math.cos(a) * r2,
      z: Math.sin(a) * r2,
    });
  }
  return pieces;
}
