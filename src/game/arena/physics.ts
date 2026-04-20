import { ARENA, COVERS, PLAYER } from "./constants";
import type { Entity, Vec3 } from "./types";

export function clampToArena(p: Vec3) {
  const lim = ARENA.size - PLAYER.radius - 0.1;
  if (p.x >  lim) p.x =  lim;
  if (p.x < -lim) p.x = -lim;
  if (p.z >  lim) p.z =  lim;
  if (p.z < -lim) p.z = -lim;
}

// Resolve player vs cover AABB collision (XZ plane)
export function resolveCovers(p: Vec3) {
  for (const c of COVERS) {
    const minX = c.x - c.w / 2 - PLAYER.radius;
    const maxX = c.x + c.w / 2 + PLAYER.radius;
    const minZ = c.z - c.d / 2 - PLAYER.radius;
    const maxZ = c.z + c.d / 2 + PLAYER.radius;
    if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
      // push out along smallest overlap
      const dxL = Math.abs(p.x - minX);
      const dxR = Math.abs(maxX - p.x);
      const dzT = Math.abs(p.z - minZ);
      const dzB = Math.abs(maxZ - p.z);
      const m = Math.min(dxL, dxR, dzT, dzB);
      if (m === dxL) p.x = minX;
      else if (m === dxR) p.x = maxX;
      else if (m === dzT) p.z = minZ;
      else p.z = maxZ;
    }
  }
}

// Ray-AABB intersection, returns t (>=0) or Infinity
function rayAabb(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minx: number, miny: number, minz: number, maxx: number, maxy: number, maxz: number) {
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ox : i === 1 ? oy : oz;
    const d = i === 0 ? dx : i === 1 ? dy : dz;
    const lo = i === 0 ? minx : i === 1 ? miny : minz;
    const hi = i === 0 ? maxx : i === 1 ? maxy : maxz;
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : Infinity);
}

// Ray-sphere; returns t or Infinity. Ignore behind origin.
function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, r: number) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = 2 * (dx * lx + dy * ly + dz * lz);
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / 2;
  const t2 = (-b + s) / 2;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return Infinity;
}

export interface RayHit {
  t: number;
  point: Vec3;
  victimId?: string;
  headshot?: boolean;
  surface: "world" | "cover" | "player";
}

// Cast a ray in world. Returns first hit (cover, ground bound, or player capsule head/body).
export function raycast(
  origin: Vec3, dir: Vec3, maxDist: number,
  entities: Entity[], shooterId: string,
): RayHit {
  let bestT = maxDist;
  let best: RayHit = { t: maxDist, point: addScaled(origin, dir, maxDist), surface: "world" };

  // Ground plane y=0
  if (dir.y < -1e-4) {
    const tg = -origin.y / dir.y;
    if (tg > 0 && tg < bestT) {
      bestT = tg;
      best = { t: tg, point: addScaled(origin, dir, tg), surface: "world" };
    }
  }

  // Walls (4 AABBs forming arena box) — use ray vs each wall plane via box test
  const lim = ARENA.size;
  const wallH = ARENA.wallH;
  const walls = [
    { minx: -lim - 1, miny: 0, minz: -lim - 1, maxx: lim + 1, maxy: wallH, maxz: -lim },
    { minx: -lim - 1, miny: 0, minz:  lim,     maxx: lim + 1, maxy: wallH, maxz: lim + 1 },
    { minx: -lim - 1, miny: 0, minz: -lim,     maxx: -lim,    maxy: wallH, maxz: lim },
    { minx:  lim,     miny: 0, minz: -lim,     maxx: lim + 1, maxy: wallH, maxz: lim },
  ];
  for (const w of walls) {
    const t = rayAabb(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      w.minx, w.miny, w.minz, w.maxx, w.maxy, w.maxz);
    if (t < bestT) { bestT = t; best = { t, point: addScaled(origin, dir, t), surface: "world" }; }
  }

  // Covers
  for (const c of COVERS) {
    const t = rayAabb(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      c.x - c.w / 2, 0, c.z - c.d / 2, c.x + c.w / 2, c.h, c.z + c.d / 2);
    if (t < bestT) { bestT = t; best = { t, point: addScaled(origin, dir, t), surface: "cover" }; }
  }

  // Players: head sphere + body sphere
  for (const e of entities) {
    if (!e.alive || e.id === shooterId) continue;
    const headY = e.pos.y + 1.7;
    const bodyY = e.pos.y + 1.0;
    const tH = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      e.pos.x, headY, e.pos.z, 0.22);
    const tB = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      e.pos.x, bodyY, e.pos.z, 0.55);
    const tP = Math.min(tH, tB);
    if (tP < bestT) {
      bestT = tP;
      best = {
        t: tP,
        point: addScaled(origin, dir, tP),
        surface: "player",
        victimId: e.id,
        headshot: tH < tB,
      };
    }
  }

  return best;
}

export function addScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

export function dirFromYawPitch(yaw: number, pitch: number): Vec3 {
  // yaw=0 looks +Z, +yaw rotates toward +X (right-handed Y-up matches three default)
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
}

export function distXZ(a: Vec3, b: Vec3) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.hypot(dx, dz);
}
