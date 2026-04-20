// Arena constants — calibrated for browser TPP shooter
export const ARENA = {
  size: 28,           // half-extent (so 56x56 m)
  wallH: 4,
};

export const PLAYER = {
  radius: 0.45,
  height: 1.8,
  eye: 1.65,
  walkSpeed: 4.0,
  sprintSpeed: 6.5,
  accel: 22,
  friction: 9,
  jumpVel: 7.0,
  gravity: -16,
  rotSpeed: 9,
};

export const WEAPON = {
  baseDamage: 22,
  headMul: 2.0,
  rpm: 600,
  mag: 30,
  reserve: 120,
  reloadMs: 2000,
  range: 80,
  spreadHip: 0.06,        // rad (~3.4°)
  spreadAds: 0.012,       // ~0.7°
  spreadMove: 0.04,
  spreadAir: 0.08,
  recoilPerShot: 0.18,
  recoilDecay: 2.4,       // per second
  bloomPerShot: 0.012,
  bloomDecay: 0.12,       // per second
};

export const MATCH = {
  startCountdownMs: 3000,
  matchMs: 5 * 60 * 1000,
  respawnMs: 2500,
  killTarget: 10,
};

// Cover placement — symmetric arena
import type { Cover } from "./types";
export const COVERS: Cover[] = [
  // central pillars
  { x: 0,   z: 0,   w: 1.6, d: 1.6, h: 2.6 },
  { x: -6,  z: -3,  w: 2.4, d: 0.8, h: 1.2 },
  { x:  6,  z:  3,  w: 2.4, d: 0.8, h: 1.2 },
  { x: -10, z:  6,  w: 0.8, d: 3.0, h: 2.0 },
  { x:  10, z: -6,  w: 0.8, d: 3.0, h: 2.0 },
  // outer cover
  { x: -16, z: -10, w: 3.0, d: 1.0, h: 1.4 },
  { x:  16, z:  10, w: 3.0, d: 1.0, h: 1.4 },
  { x: -16, z:  10, w: 1.0, d: 3.0, h: 1.4 },
  { x:  16, z: -10, w: 1.0, d: 3.0, h: 1.4 },
  // small crates
  { x: -2,  z:  8,  w: 1.2, d: 1.2, h: 1.0 },
  { x:  2,  z: -8,  w: 1.2, d: 1.2, h: 1.0 },
  { x: -8,  z: -12, w: 1.4, d: 1.4, h: 1.2 },
  { x:  8,  z:  12, w: 1.4, d: 1.4, h: 1.2 },
];

export const SPAWNS_A = [
  { x: -22, y: 0, z: -22 },
  { x: -22, y: 0, z:  22 },
];
export const SPAWNS_B = [
  { x:  22, y: 0, z:  22 },
  { x:  22, y: 0, z: -22 },
];
