// Sling Puck types.

export interface Puck {
  id: number;
  side: 0 | 1;       // owner color (0 = bottom/white, 1 = top/black)
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;    // false if removed (not used currently)
}

// Legacy aliases so older imports (Disc/StrikerState) keep compiling.
export type Disc = Puck;

export interface StrikerState {
  x: number; y: number; vx: number; vy: number; active: boolean;
}

export interface Player {
  name: string;
  isBot: boolean;
}

export interface MatchState {
  players: [Player, Player];
  turn: 0 | 1;
  pucks: Puck[];
  // Legacy alias — kept to satisfy older code that referenced state.discs/striker.
  discs: Puck[];
  striker: StrikerState;
  message: string;
  winner: 0 | 1 | null;
  shotInProgress: boolean;
  lastFoul: string | null;
}

export interface ShotResult {
  hitAny: boolean;
  outOfBounds: boolean;
  pucksCrossedGap: number;     // count of THIS player's pucks that crossed to opponent half
  maxPuckDisplacement: number;
  // Legacy aliases:
  discsCrossedCenter: number;
  maxDiscDisplacement: number;
}
