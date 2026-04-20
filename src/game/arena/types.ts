export type Vec3 = { x: number; y: number; z: number };

export interface Entity {
  id: string;
  pos: Vec3;
  vel: Vec3;
  yaw: number;          // facing yaw (radians)
  pitch: number;        // aim pitch (radians)
  hp: number;
  maxHp: number;
  alive: boolean;
  ammo: number;
  reserve: number;
  reloading: boolean;
  reloadEnd: number;    // performance.now() ms
  lastShotAt: number;   // performance.now() ms
  recoil: number;       // 0..1 accumulator
  spread: number;       // current spread cone in radians
  isBot: boolean;
  name: string;
  color: string;
  kills: number;
  deaths: number;
  respawnAt: number;    // ms timestamp; 0 if alive
}

export interface HitEvent {
  shooter: string;
  victim: string;
  damage: number;
  headshot: boolean;
  at: number;
}

export interface KillFeedItem {
  id: number;
  shooter: string;
  victim: string;
  headshot: boolean;
  at: number;
}

export interface Tracer {
  id: number;
  from: Vec3;
  to: Vec3;
  bornAt: number;
  hit: boolean;
}

export interface MuzzleFlash {
  id: number;
  pos: Vec3;
  yaw: number;
  bornAt: number;
}

export interface Cover {
  x: number; z: number;
  w: number; d: number;
  h: number;
}
