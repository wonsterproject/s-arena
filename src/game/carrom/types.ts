import type { PieceColor } from "./constants";

export type PlayerSide = 0 | 1; // 0 = bottom (white), 1 = top (black) — assignment finalized after first cover

export interface PlayerState {
  side: PlayerSide;
  name: string;
  isBot: boolean;
  color: "white" | "black" | null; // assigned after first pocket
  score: number;
  hasQueen: boolean;       // queen pocketed (pending cover)
  queenCovered: boolean;   // confirmed
}

export interface PieceState {
  id: string;
  color: PieceColor;
  pocketed: boolean;
}

export interface ShotEventLog {
  pocketedThisShot: PieceColor[];
  strikerPocketed: boolean;
  hitAny: boolean;
  firstContactColor: PieceColor | "striker" | null;
}

export interface MatchState {
  players: [PlayerState, PlayerState];
  turn: PlayerSide;
  pieces: PieceState[];
  queenPocketedPending: boolean; // queen pocketed but waiting for cover
  queenOwnerPending: PlayerSide | null;
  winner: PlayerSide | null;
  message: string;
}
