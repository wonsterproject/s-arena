import { MATCH, PLAYER, SPAWNS_A, SPAWNS_B, WEAPON } from "./constants";
import type { Entity, KillFeedItem, MuzzleFlash, Tracer, Vec3 } from "./types";
import { addScaled, clampToArena, dirFromYawPitch, raycast, resolveCovers } from "./physics";
import { playDeath, playFootstep, playGunshot, playHit, playJump, playReload } from "./sounds";

let _id = 1;
const nid = () => _id++;

export function makeEntity(opts: Partial<Entity> & { id: string; name: string; isBot: boolean; color: string; spawn: Vec3 }): Entity {
  return {
    id: opts.id,
    name: opts.name,
    isBot: opts.isBot,
    color: opts.color,
    pos: { ...opts.spawn },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0,
    hp: 100, maxHp: 100, alive: true,
    ammo: WEAPON.mag, reserve: WEAPON.reserve,
    reloading: false, reloadEnd: 0, lastShotAt: 0,
    recoil: 0, spread: WEAPON.spreadHip,
    kills: 0, deaths: 0, respawnAt: 0,
    crouch: false, animPhase: 0, fireFlashAt: 0,
  };
}

export interface ShotInput {
  fire: boolean;
  ads: boolean;
  reload: boolean;
}

export interface MoveInput {
  // local-space input relative to entity yaw
  forward: number; // -1..1
  right: number;   // -1..1
  jump: boolean;
  sprint: boolean;
  crouch?: boolean;
  desiredYaw: number;
  desiredPitch: number;
}

export interface ArenaState {
  startedAt: number;
  endsAt: number;
  finished: boolean;
  winnerId: string | null;
  entities: Entity[];
  tracers: Tracer[];
  flashes: MuzzleFlash[];
  killFeed: KillFeedItem[];
  lastDamage?: { victimId: string; from: Vec3; at: number };
}

export function makeMatch(p1Name: string, p2Name: string): ArenaState {
  const p1 = makeEntity({ id: "p1", name: p1Name, isBot: false, color: "#22d3ee", spawn: SPAWNS_A[0] });
  const p2 = makeEntity({ id: "p2", name: p2Name, isBot: true,  color: "#f97316", spawn: SPAWNS_B[0] });
  // face center
  p1.yaw = Math.atan2(0 - p1.pos.x, 0 - p1.pos.z);
  p2.yaw = Math.atan2(0 - p2.pos.x, 0 - p2.pos.z);
  return {
    startedAt: performance.now(),
    endsAt: performance.now() + MATCH.matchMs,
    finished: false, winnerId: null,
    entities: [p1, p2], tracers: [], flashes: [], killFeed: [],
  };
}

function pickSpawn(forId: string, state: ArenaState): Vec3 {
  const list = forId === "p1" ? SPAWNS_A : SPAWNS_B;
  const opp = state.entities.find(e => e.id !== forId);
  let best = list[0]; let bestScore = -Infinity;
  for (const s of list) {
    const d = opp ? Math.hypot(opp.pos.x - s.x, opp.pos.z - s.z) : 0;
    const score = d + Math.random() * 2;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return { ...best };
}

export function respawn(e: Entity, state: ArenaState) {
  const sp = pickSpawn(e.id, state);
  e.pos = sp; e.vel = { x: 0, y: 0, z: 0 };
  e.hp = e.maxHp; e.alive = true;
  e.ammo = WEAPON.mag; e.reserve = WEAPON.reserve;
  e.reloading = false; e.recoil = 0; e.respawnAt = 0;
  e.crouch = false; e.animPhase = 0; e.fireFlashAt = 0;
  // face center
  e.yaw = Math.atan2(0 - e.pos.x, 0 - e.pos.z);
  e.pitch = 0;
}

function startReload(e: Entity, now: number) {
  if (e.reloading || e.ammo === WEAPON.mag || e.reserve === 0) return;
  e.reloading = true;
  e.reloadEnd = now + WEAPON.reloadMs;
  if (!e.isBot) playReload();
}

function finishReload(e: Entity) {
  const need = WEAPON.mag - e.ammo;
  const take = Math.min(need, e.reserve);
  e.ammo += take;
  e.reserve -= take;
  e.reloading = false;
}

export function fireWeapon(e: Entity, ads: boolean, state: ArenaState, now: number, onHit?: (victim: Entity, dmg: number, head: boolean) => void): boolean {
  if (!e.alive || e.reloading || e.ammo <= 0) return false;
  const interval = 60000 / WEAPON.rpm;
  if (now - e.lastShotAt < interval) return false;
  e.lastShotAt = now;
  e.ammo -= 1;

  const baseSpread = ads ? WEAPON.spreadAds : WEAPON.spreadHip;
  const moving = Math.hypot(e.vel.x, e.vel.z) > 1.5 ? WEAPON.spreadMove : 0;
  const air = Math.abs(e.vel.y) > 0.1 ? WEAPON.spreadAir : 0;
  const total = baseSpread + moving + air + e.spread;

  // jitter
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * total;
  const localYaw = e.yaw + Math.cos(a) * r;
  const localPitch = e.pitch + Math.sin(a) * r;

  const origin: Vec3 = { x: e.pos.x, y: e.pos.y + PLAYER.eye, z: e.pos.z };
  const dir = dirFromYawPitch(localYaw, localPitch);
  const hit = raycast(origin, dir, WEAPON.range, state.entities, e.id);

  // tracer
  state.tracers.push({
    id: nid(),
    from: { x: origin.x + Math.sin(e.yaw) * 0.4, y: origin.y - 0.15, z: origin.z + Math.cos(e.yaw) * 0.4 },
    to: hit.point,
    bornAt: now,
    hit: !!hit.victimId,
  });
  // muzzle flash
  state.flashes.push({ id: nid(), pos: { x: origin.x, y: origin.y - 0.05, z: origin.z }, yaw: e.yaw, bornAt: now });

  e.recoil = Math.min(1, e.recoil + WEAPON.recoilPerShot);
  e.spread = Math.min(0.18, e.spread + WEAPON.bloomPerShot);
  e.pitch = Math.max(-0.9, Math.min(0.9, e.pitch + WEAPON.recoilPerShot * 0.06));

  if (hit.victimId) {
    const victim = state.entities.find(x => x.id === hit.victimId);
    if (victim && victim.alive) {
      const dmg = WEAPON.baseDamage * (hit.headshot ? WEAPON.headMul : 1.0);
      victim.hp -= dmg;
      state.lastDamage = { victimId: victim.id, from: { ...e.pos }, at: now };
      onHit?.(victim, dmg, !!hit.headshot);
      if (victim.hp <= 0) {
        victim.hp = 0; victim.alive = false; victim.deaths += 1;
        e.kills += 1;
        victim.respawnAt = now + MATCH.respawnMs;
        state.killFeed.push({ id: nid(), shooter: e.name, victim: victim.name, headshot: !!hit.headshot, at: now });
        // win check
        if (e.kills >= MATCH.killTarget) {
          state.finished = true; state.winnerId = e.id;
        }
      }
    }
  }
  return true;
}

export function stepEntityMovement(e: Entity, input: MoveInput, dt: number) {
  // Yaw smoothing
  const dy = input.desiredYaw - e.yaw;
  const wrapped = Math.atan2(Math.sin(dy), Math.cos(dy));
  e.yaw += wrapped * Math.min(1, dt * PLAYER.rotSpeed);
  e.pitch = Math.max(-0.9, Math.min(0.9, input.desiredPitch));

  // Local input → world direction relative to yaw
  // Convention: yaw=0 faces +Z. Camera sits behind on -Z looking toward +Z.
  // From the on-screen viewpoint, world +X appears on the LEFT, so screen-right strafe = world -X.
  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const f = input.forward, r = input.right;
  const len = Math.hypot(f, r) || 1;
  const nf = f / Math.max(1, len);
  const nr = r / Math.max(1, len);
  // forward axis (world) = (sin(yaw), cos(yaw)); right-on-screen axis (world) = (-cos(yaw), sin(yaw))
  const wx = Math.sin(e.yaw) * nf - Math.cos(e.yaw) * nr;
  const wz = Math.cos(e.yaw) * nf + Math.sin(e.yaw) * nr;

  const targetVx = wx * speed;
  const targetVz = wz * speed;

  // Accel
  e.vel.x += (targetVx - e.vel.x) * Math.min(1, dt * PLAYER.accel * 0.5);
  e.vel.z += (targetVz - e.vel.z) * Math.min(1, dt * PLAYER.accel * 0.5);
  // Friction when no input
  if (Math.hypot(f, r) < 0.05) {
    const damp = Math.max(0, 1 - PLAYER.friction * dt);
    e.vel.x *= damp; e.vel.z *= damp;
  }

  // Jump
  if (input.jump && Math.abs(e.pos.y) < 0.01 && e.vel.y <= 0.01) {
    e.vel.y = PLAYER.jumpVel;
  }
  // Gravity
  e.vel.y += PLAYER.gravity * dt;

  e.pos.x += e.vel.x * dt;
  e.pos.y += e.vel.y * dt;
  e.pos.z += e.vel.z * dt;

  if (e.pos.y < 0) { e.pos.y = 0; e.vel.y = 0; }

  clampToArena(e.pos);
  resolveCovers(e.pos);
}

export function decayWeapon(e: Entity, dt: number, now: number) {
  e.recoil = Math.max(0, e.recoil - WEAPON.recoilDecay * dt);
  e.spread = Math.max(0, e.spread - WEAPON.bloomDecay * dt);
  if (e.reloading && now >= e.reloadEnd) finishReload(e);
}

export function tickRespawns(state: ArenaState, now: number) {
  for (const e of state.entities) {
    if (!e.alive && now >= e.respawnAt) respawn(e, state);
  }
}

export function applyReloadInput(e: Entity, input: ShotInput, now: number) {
  if (input.reload) startReload(e, now);
  if (e.ammo === 0 && !e.reloading) startReload(e, now);
}

export function pruneFx(state: ArenaState, now: number) {
  state.tracers = state.tracers.filter(t => now - t.bornAt < 90);
  state.flashes = state.flashes.filter(f => now - f.bornAt < 70);
  state.killFeed = state.killFeed.filter(k => now - k.at < 4500);
}
