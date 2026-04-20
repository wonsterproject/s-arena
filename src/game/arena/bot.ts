import type { Entity, Vec3 } from "./types";
import { COVERS, WEAPON } from "./constants";
import { raycast, dirFromYawPitch, distXZ } from "./physics";

export type Diff = "easy" | "medium" | "hard";

interface BotMem {
  state: "hunt" | "engage" | "reposition" | "reload";
  targetPos: Vec3;
  nextThinkAt: number;
  fireAccumulator: number; // for trigger discipline
  jitter: number;
  reactionMs: number;
  acquiredAt: number;
}

const memMap = new WeakMap<Entity, BotMem>();

function makeMem(diff: Diff): BotMem {
  const j = diff === "easy" ? 0.06 : diff === "medium" ? 0.025 : 0.012;
  const r = diff === "easy" ? 480 : diff === "medium" ? 260 : 140;
  return {
    state: "hunt",
    targetPos: { x: 0, y: 0, z: 0 },
    nextThinkAt: 0,
    fireAccumulator: 0,
    jitter: j,
    reactionMs: r,
    acquiredAt: 0,
  };
}

function pickRoamPoint(self: Entity, opp: Entity): Vec3 {
  // pick a cover near opponent line
  const candidates = COVERS.map(c => {
    const cx = c.x, cz = c.z;
    const distToOpp = Math.hypot(opp.pos.x - cx, opp.pos.z - cz);
    const distToSelf = Math.hypot(self.pos.x - cx, self.pos.z - cz);
    // prefer cover within 8-16m of opponent and not too far from self
    const score = -Math.abs(distToOpp - 12) - distToSelf * 0.3 + Math.random() * 4;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  const pick = candidates[Math.floor(Math.random() * 3)].c;
  // offset to side of cover facing away from opponent
  const dx = pick.x - opp.pos.x;
  const dz = pick.z - opp.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: pick.x + (dx / len) * 1.5, y: 0, z: pick.z + (dz / len) * 1.5 };
}

export interface BotInput {
  moveX: number;       // -1..1 (right/left strafe)
  moveZ: number;       // -1..1 (forward/back)
  desiredYaw: number;
  desiredPitch: number;
  fire: boolean;
  reload: boolean;
}

export function botStep(
  self: Entity,
  opp: Entity,
  entities: Entity[],
  diff: Diff,
  now: number,
): BotInput {
  let mem = memMap.get(self);
  if (!mem) { mem = makeMem(diff); memMap.set(self, mem); }

  const out: BotInput = { moveX: 0, moveZ: 0, desiredYaw: self.yaw, desiredPitch: self.pitch, fire: false, reload: false };
  if (!self.alive || !opp.alive) return out;

  // Aim at opponent's chest with jitter
  const tx = opp.pos.x - self.pos.x;
  const ty = (opp.pos.y + 1.2) - (self.pos.y + 1.65);
  const tz = opp.pos.z - self.pos.z;
  const horiz = Math.hypot(tx, tz);
  const desiredYaw = Math.atan2(tx, tz) + (Math.random() - 0.5) * mem.jitter;
  const desiredPitch = Math.atan2(ty, horiz) + (Math.random() - 0.5) * mem.jitter * 0.6;
  out.desiredYaw = desiredYaw;
  out.desiredPitch = Math.max(-0.6, Math.min(0.7, desiredPitch));

  // LOS
  const eye = { x: self.pos.x, y: self.pos.y + 1.65, z: self.pos.z };
  const dir = dirFromYawPitch(desiredYaw, desiredPitch);
  const hit = raycast(eye, dir, WEAPON.range, entities, self.id);
  const seesOpp = hit.victimId === opp.id;

  // Reload if low
  if (self.ammo === 0 && !self.reloading && self.reserve > 0) {
    out.reload = true;
  }
  if (self.ammo < 6 && !seesOpp && !self.reloading && self.reserve > 0) {
    out.reload = true;
  }

  // Decide state
  if (now > mem.nextThinkAt) {
    mem.nextThinkAt = now + 600 + Math.random() * 600;
    const dist = distXZ(self.pos, opp.pos);
    if (seesOpp && dist < 22) {
      mem.state = "engage";
      mem.acquiredAt = mem.acquiredAt || now;
    } else {
      mem.state = "hunt";
      mem.acquiredAt = 0;
      mem.targetPos = pickRoamPoint(self, opp);
    }
  }

  // Movement
  if (mem.state === "engage") {
    // strafe a bit while shooting
    const t = now * 0.001;
    out.moveX = Math.sin(t * (1.5 + (diff === "hard" ? 1 : 0))) * 0.7;
    // stay at 8-14m
    const dist = distXZ(self.pos, opp.pos);
    if (dist > 14) out.moveZ = 0.6;
    else if (dist < 7) out.moveZ = -0.4;
  } else {
    // hunt: walk toward target
    const dx = mem.targetPos.x - self.pos.x;
    const dz = mem.targetPos.z - self.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      // move in world space then convert to local relative to facing
      const wantYaw = Math.atan2(dx, dz);
      const dy = wantYaw - self.yaw;
      const fy = Math.atan2(Math.sin(dy), Math.cos(dy));
      out.moveZ = Math.cos(fy);
      out.moveX = Math.sin(fy);
    } else {
      mem.nextThinkAt = 0;
    }
  }

  // Fire — only when LOS, after reaction time, and aim roughly aligned
  if (seesOpp && self.ammo > 0 && !self.reloading) {
    if (mem.acquiredAt === 0) mem.acquiredAt = now;
    if (now - mem.acquiredAt > mem.reactionMs) {
      // burst control
      mem.fireAccumulator += 16;
      const burstLen = diff === "easy" ? 250 : diff === "medium" ? 450 : 700;
      const burstPause = diff === "easy" ? 600 : diff === "medium" ? 320 : 180;
      const cycle = burstLen + burstPause;
      const phase = mem.fireAccumulator % cycle;
      out.fire = phase < burstLen;
    }
  } else {
    mem.acquiredAt = 0;
  }

  return out;
}
