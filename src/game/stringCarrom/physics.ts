// Sling Puck physics — vertical board with center wall + gap, no strings, no striker.
import { BOARD, PUCK, PHYS, GAP } from "./constants";
import type { Puck, ShotResult, StrikerState } from "./types";

interface Body {
  x: number; y: number;
  vx: number; vy: number;
  r: number; m: number;
  ref: Puck;
}

function clampSpeed(b: Body, max = 22) {
  const s = Math.hypot(b.vx, b.vy);
  if (s > max) { b.vx = (b.vx / s) * max; b.vy = (b.vy / s) * max; }
}

function reflect(b: Body, nx: number, ny: number, e: number) {
  const dot = b.vx * nx + b.vy * ny;
  if (dot >= 0) return;
  b.vx -= (1 + e) * dot * nx;
  b.vy -= (1 + e) * dot * ny;
}

function collideCircles(a: Body, b: Body, e: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (minDist - dist) + 1e-5;
  const totalInvMass = 1 / a.m + 1 / b.m;
  const corrA = (1 / a.m) / totalInvMass;
  const corrB = (1 / b.m) / totalInvMass;
  a.x -= nx * overlap * corrA;
  a.y -= ny * overlap * corrA;
  b.x += nx * overlap * corrB;
  b.y += ny * overlap * corrB;
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal > 0) return true;
  const j = -(1 + e) * velAlongNormal / totalInvMass;
  a.vx -= j * nx / a.m;
  a.vy -= j * ny / a.m;
  b.vx += j * nx / b.m;
  b.vy += j * ny / b.m;
  return true;
}

// Center divider: solid horizontal band at y=0 EXCEPT for a gap on x ∈ [GAP.xMin, GAP.xMax].
// Treat as two solid horizontal segments: [-halfW, gapMin] and [gapMax, +halfW].
function collideCenterWall(b: Body): boolean {
  const halfThk = GAP.thickness;
  // If outside the wall's y influence, skip
  if (Math.abs(b.y) > b.r + halfThk + 0.001) return false;

  const segs: Array<[number, number]> = [
    [-BOARD.halfW, GAP.xMin],
    [GAP.xMax, BOARD.halfW],
  ];
  let collided = false;
  for (const [xa, xb] of segs) {
    if (b.x + b.r < xa || b.x - b.r > xb) continue;
    // Closest point on the segment band to the puck center.
    const cx = Math.max(xa, Math.min(xb, b.x));
    const cy = Math.max(-halfThk, Math.min(halfThk, b.y));
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r) continue;
    const dist = Math.sqrt(d2) || 1e-6;
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = b.r - dist + 1e-5;
    b.x += nx * overlap;
    b.y += ny * overlap;
    reflect(b, nx, ny, PHYS.wallRestitution);
    collided = true;
  }
  return collided;
}

function applyWalls(b: Body): boolean {
  let hit = false;
  if (b.x - b.r < -BOARD.halfW) {
    b.x = -BOARD.halfW + b.r;
    if (b.vx < 0) { b.vx = -b.vx * PHYS.wallRestitution; hit = true; }
  } else if (b.x + b.r > BOARD.halfW) {
    b.x = BOARD.halfW - b.r;
    if (b.vx > 0) { b.vx = -b.vx * PHYS.wallRestitution; hit = true; }
  }
  if (b.y - b.r < -BOARD.halfH) {
    b.y = -BOARD.halfH + b.r;
    if (b.vy < 0) { b.vy = -b.vy * PHYS.wallRestitution; hit = true; }
  } else if (b.y + b.r > BOARD.halfH) {
    b.y = BOARD.halfH - b.r;
    if (b.vy > 0) { b.vy = -b.vy * PHYS.wallRestitution; hit = true; }
  }
  return hit;
}

// Step: integrate, resolve walls + center divider + puck-puck collisions.
// `_striker` is unused (kept for legacy signature).
export function step(pucks: Puck[], _striker?: StrikerState): boolean {
  const dt = PHYS.dt;
  const bodies: Body[] = [];
  for (const p of pucks) {
    if (!p.alive) continue;
    bodies.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: PUCK.radius, m: PUCK.mass, ref: p });
  }

  const maxSpeed = bodies.reduce((m, b) => Math.max(m, Math.hypot(b.vx, b.vy)), 0);
  const substeps = Math.min(8, Math.max(1, Math.ceil(maxSpeed / 3)));
  const sdt = dt / substeps;

  for (let s = 0; s < substeps; s++) {
    for (const b of bodies) {
      clampSpeed(b);
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
    }
    for (const b of bodies) collideCenterWall(b);
    for (const b of bodies) applyWalls(b);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        collideCircles(bodies[i], bodies[j], PUCK.restitution);
      }
    }
  }

  let anyMoving = false;
  for (const b of bodies) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const dragMul = Math.max(0, 1 - PHYS.drag * dt);
      b.vx *= dragMul;
      b.vy *= dragMul;
      const sp2 = Math.hypot(b.vx, b.vy);
      if (sp2 > 0) {
        const newSp = Math.max(0, sp2 - PHYS.rollingFriction);
        const k = newSp / sp2;
        b.vx *= k; b.vy *= k;
      }
    }
    if (Math.hypot(b.vx, b.vy) < PHYS.sleepSpeed) {
      b.vx = 0; b.vy = 0;
    } else {
      anyMoving = true;
    }
    b.ref.x = b.x; b.ref.y = b.y;
    b.ref.vx = b.vx; b.ref.vy = b.vy;
  }
  return anyMoving;
}

// Apply a sling shot impulse to a SPECIFIC puck.
// dir is unit vector pointing the puck's flight direction; power01 ∈ [0,1].
export function applySlingShot(puck: Puck, dirX: number, dirY: number, power01: number) {
  const len = Math.hypot(dirX, dirY) || 1;
  dirX /= len; dirY /= len;
  const p01 = Math.max(0, Math.min(1, power01));
  const speed = PHYS.pMin + (PHYS.pMax - PHYS.pMin) * Math.pow(p01, PHYS.powerCurve);
  puck.vx = dirX * speed;
  puck.vy = dirY * speed;
}

// Legacy alias — used by Match page. Treats striker as a moving body shim.
export function applyShot(striker: StrikerState, dirX: number, dirY: number, power01: number) {
  const len = Math.hypot(dirX, dirY) || 1;
  dirX /= len; dirY /= len;
  const p01 = Math.max(0, Math.min(1, power01));
  const speed = PHYS.pMin + (PHYS.pMax - PHYS.pMin) * Math.pow(p01, PHYS.powerCurve);
  striker.vx = dirX * speed;
  striker.vy = dirY * speed;
  striker.active = true;
}

// Run full simulation until rest or timeout.
export function simulate(pucks: Puck[]): ShotResult {
  const before = pucks.map(p => ({
    x: p.x, y: p.y, side: p.side,
    crossedBefore: (p.side === 0 ? p.y > 0 : p.y < 0),
  }));
  let t = 0; let safety = 0;
  while (t < PHYS.maxSimSeconds && safety < 6000) {
    const moving = step(pucks);
    t += PHYS.dt; safety++;
    if (!moving) break;
  }
  let maxDisp = 0; let crossed = 0;
  for (let i = 0; i < pucks.length; i++) {
    const p = pucks[i];
    const b = before[i];
    const disp = Math.hypot(p.x - b.x, p.y - b.y);
    if (disp > maxDisp) maxDisp = disp;
    const isOnOpp = b.side === 0 ? p.y > 0 : p.y < 0;
    if (isOnOpp && !b.crossedBefore) crossed++;
  }
  return {
    hitAny: maxDisp > 0.005,
    outOfBounds: false,
    pucksCrossedGap: crossed,
    maxPuckDisplacement: maxDisp,
    discsCrossedCenter: crossed,
    maxDiscDisplacement: maxDisp,
  };
}
