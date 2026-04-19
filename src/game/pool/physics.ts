import { TABLE, BALL, POCKETS, PHYS } from "./constants";
import type { Ball, ShotResult } from "./types";

// Mutates the balls array. Returns shot info once everything settles.
export function simulate(balls: Ball[]): ShotResult {
  const cue = balls.find(b => b.id === 0)!;
  let firstContactId: number | null = null;
  let cushionAfterContact = false;
  let cueTouchedAfterContact = false;
  const pocketedIds: number[] = [];
  let hitAny = false;

  const playMinX = -TABLE.halfW + TABLE.cushionInset + BALL.radius;
  const playMaxX =  TABLE.halfW - TABLE.cushionInset - BALL.radius;
  const playMinZ = -TABLE.halfH + TABLE.cushionInset + BALL.radius;
  const playMaxZ =  TABLE.halfH - TABLE.cushionInset - BALL.radius;

  const maxSteps = Math.ceil(PHYS.maxSimSeconds / PHYS.dt);
  for (let step = 0; step < maxSteps; step++) {
    // Integrate
    let anyMoving = false;
    for (const b of balls) {
      if (b.pocketed) continue;
      if (Math.hypot(b.vx, b.vz) > PHYS.restThreshold) anyMoving = true;
      b.x += b.vx * PHYS.dt;
      b.z += b.vz * PHYS.dt;
      // Friction (continuous, applied per dt)
      const decay = Math.pow(PHYS.friction, PHYS.dt * 60);
      b.vx *= decay;
      b.vz *= decay;
      if (Math.hypot(b.vx, b.vz) < PHYS.restThreshold) {
        b.vx = 0; b.vz = 0;
      }
    }

    // Cushion collisions
    for (const b of balls) {
      if (b.pocketed) continue;
      let bounced = false;
      if (b.x < playMinX) { b.x = playMinX; b.vx = -b.vx * PHYS.cushionRestitution; bounced = true; }
      else if (b.x > playMaxX) { b.x = playMaxX; b.vx = -b.vx * PHYS.cushionRestitution; bounced = true; }
      if (b.z < playMinZ) { b.z = playMinZ; b.vz = -b.vz * PHYS.cushionRestitution; bounced = true; }
      else if (b.z > playMaxZ) { b.z = playMaxZ; b.vz = -b.vz * PHYS.cushionRestitution; bounced = true; }
      if (bounced && firstContactId !== null) cushionAfterContact = true;
    }

    // Ball-ball collisions
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const c = balls[j];
        if (c.pocketed) continue;
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const dist = Math.hypot(dx, dz);
        const minDist = BALL.radius * 2;
        if (dist > 0 && dist < minDist) {
          // Resolve overlap
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          a.x -= nx * overlap / 2;
          a.z -= nz * overlap / 2;
          c.x += nx * overlap / 2;
          c.z += nz * overlap / 2;
          // Elastic 1D along normal
          const va = a.vx * nx + a.vz * nz;
          const vc = c.vx * nx + c.vz * nz;
          const diff = (vc - va) * PHYS.restitution;
          a.vx += nx * (vc - va);
          a.vz += nz * (vc - va);
          c.vx -= nx * (vc - va);
          c.vz -= nz * (vc - va);
          // Apply restitution damping
          a.vx *= 0.5 + 0.5 * PHYS.restitution;
          a.vz *= 0.5 + 0.5 * PHYS.restitution;
          c.vx *= 0.5 + 0.5 * PHYS.restitution;
          c.vz *= 0.5 + 0.5 * PHYS.restitution;
          // Track first cue contact
          if (a.id === 0 && firstContactId === null && c.id !== 0) {
            firstContactId = c.id; hitAny = true; cueTouchedAfterContact = true;
          } else if (c.id === 0 && firstContactId === null && a.id !== 0) {
            firstContactId = a.id; hitAny = true; cueTouchedAfterContact = true;
          } else if (firstContactId !== null) {
            hitAny = true;
          }
          // suppress unused warning
          void diff;
        }
      }
    }

    // Pocket detection
    for (const b of balls) {
      if (b.pocketed) continue;
      for (const p of POCKETS) {
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (d < p.r) {
          b.pocketed = true;
          b.vx = 0; b.vz = 0;
          // park off-table visually
          b.x = p.x; b.z = p.z;
          pocketedIds.push(b.id);
          if (firstContactId !== null) cushionAfterContact = true; // pocket counts as rail-equivalent for foul rule
          break;
        }
      }
    }

    if (!anyMoving) break;
  }

  void cueTouchedAfterContact;

  return {
    pocketedIds,
    cuePocketed: !!pocketedIds.find(id => id === 0),
    firstContactId,
    cushionAfterContact,
    hitAny,
  };
}

export function applyShot(cue: Ball, dirX: number, dirZ: number, power: number) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / len, uz = dirZ / len;
  const speed = Math.max(0, Math.min(1, power)) * PHYS.maxShotSpeed;
  cue.vx = ux * speed;
  cue.vz = uz * speed;
}
