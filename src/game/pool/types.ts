import type { BallKind } from "./constants";

export type Group = "solid" | "stripe";

export interface Ball {
  id: number;
  kind: BallKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  pocketed: boolean;
}

export interface Player {
  name: string;
  isBot: boolean;
  group: Group | null;       // assigned after first legal pot
  pottedCount: number;       // own group balls pocketed
}

export interface MatchState {
  players: [Player, Player];
  turn: 0 | 1;
  balls: Ball[];
  ballInHand: boolean;       // place cue anywhere legal
  message: string;
  winner: 0 | 1 | null;
  shotInProgress: boolean;
}

export interface ShotResult {
  pocketedIds: number[];     // all balls pocketed this shot (incl. cue)
  cuePocketed: boolean;
  firstContactId: number | null;  // first object ball cue hit
  cushionAfterContact: boolean;   // any ball touched a cushion after contact (or pocket)
  hitAny: boolean;
}
