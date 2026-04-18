import type { MatchState, PlayerState, PlayerSide, ShotEventLog } from "./types";
import { initialPieces } from "./constants";

export function createMatch(p1Name: string, p2Name: string, botSide: PlayerSide | null): MatchState {
  const players: [PlayerState, PlayerState] = [
    { side: 0, name: p1Name, isBot: botSide === 0, color: null, score: 0, hasQueen: false, queenCovered: false },
    { side: 1, name: p2Name, isBot: botSide === 1, color: null, score: 0, hasQueen: false, queenCovered: false },
  ];
  return {
    players,
    turn: 0,
    pieces: initialPieces().map(p => ({ id: p.id, color: p.color, pocketed: false })),
    queenPocketedPending: false,
    queenOwnerPending: null,
    winner: null,
    message: `${players[0].name}'s turn`,
  };
}

/**
 * Apply rules after a shot is fully resolved.
 * Mutates state and returns it. Caller is responsible for piece-level "pocketed=true" updates
 * before calling this (so we know what was pocketed this shot).
 */
export function resolveShot(state: MatchState, log: ShotEventLog): MatchState {
  const me = state.players[state.turn];
  const opp = state.players[1 - state.turn] as PlayerState;

  let foul = false;
  let foulReason = "";
  let continueTurn = false;

  // Assign colors lazily: first non-queen piece pocketed by a player decides their color.
  const nonQueenPocketed = log.pocketedThisShot.filter(c => c !== "queen") as ("white" | "black")[];
  if (me.color === null && nonQueenPocketed.length > 0) {
    me.color = nonQueenPocketed[0];
    opp.color = me.color === "white" ? "black" : "white";
  }

  // Foul: did not hit anything
  if (!log.hitAny) {
    foul = true; foulReason = "No piece hit — foul";
  }

  // Foul: striker pocketed
  if (log.strikerPocketed) {
    foul = true; foulReason = "Striker pocketed — foul";
  }

  // Foul: pocketed opponent's color
  if (me.color) {
    const oppColor = me.color === "white" ? "black" : "white";
    if (log.pocketedThisShot.includes(oppColor)) {
      foul = true; foulReason = `Opponent's ${oppColor} coin pocketed — foul`;
    }
  }

  // Score own coins
  if (me.color) {
    const ownCount = log.pocketedThisShot.filter(c => c === me.color).length;
    if (ownCount > 0) {
      me.score += ownCount;
      continueTurn = true;
    }
  } else if (nonQueenPocketed.length > 0) {
    // First pocket — count as own
    const ownCount = nonQueenPocketed.filter(c => c === me.color).length;
    me.score += ownCount;
    continueTurn = true;
  }

  // Queen handling
  if (log.pocketedThisShot.includes("queen")) {
    if (state.queenPocketedPending) {
      // Already pending? shouldn't happen, ignore
    } else {
      state.queenPocketedPending = true;
      state.queenOwnerPending = state.turn;
      continueTurn = true; // player must attempt cover next shot
    }
  }

  // Cover check: if queen was pending from THIS player and they pocketed own color this shot → covered!
  if (state.queenPocketedPending && state.queenOwnerPending === state.turn && me.color) {
    const ownThisShot = log.pocketedThisShot.filter(c => c === me.color).length;
    if (ownThisShot > 0 && !log.pocketedThisShot.includes("queen")) {
      // Cover successful (queen was pocketed in a previous shot, now covered)
      me.hasQueen = true;
      me.queenCovered = true;
      me.score += 3; // queen bonus
      state.queenPocketedPending = false;
      state.queenOwnerPending = null;
    }
  }

  // If queen was pocketed AND own color in same shot → instant cover
  if (log.pocketedThisShot.includes("queen") && me.color) {
    const ownSameShot = log.pocketedThisShot.filter(c => c === me.color).length;
    if (ownSameShot > 0) {
      me.hasQueen = true;
      me.queenCovered = true;
      me.score += 3;
      state.queenPocketedPending = false;
      state.queenOwnerPending = null;
    }
  }

  // Foul penalty: return one of own pocketed coins to board (we approximate by -1 score; visual return optional)
  if (foul) {
    if (me.score > 0) me.score -= 1;
    continueTurn = false;
    state.message = foulReason;
  }

  // Failed queen cover: queen returns to play (we mark as not-pocketed elsewhere via caller)
  // Caller handles re-spawning the queen if state.queenPocketedPending && !continueTurn && was pending from THIS player
  // We signal via message
  if (state.queenPocketedPending && state.queenOwnerPending === state.turn && !continueTurn) {
    state.message = "Queen not covered — returns to board";
    state.queenPocketedPending = false;
    state.queenOwnerPending = null;
    // caller will re-add queen
  }

  // Win condition: all of player's color pocketed
  for (const pl of state.players) {
    if (!pl.color) continue;
    const remaining = state.pieces.filter(p => p.color === pl.color && !p.pocketed).length;
    if (remaining === 0 && !state.queenPocketedPending) {
      // Must also have queen covered to win (standard rule)
      if (pl.queenCovered || state.players.every(p => !p.hasQueen)) {
        state.winner = pl.side;
        state.message = `${pl.name} wins!`;
        return state;
      }
    }
  }

  if (!state.winner) {
    if (!continueTurn) {
      state.turn = (1 - state.turn) as PlayerSide;
      if (!foul) state.message = `${state.players[state.turn].name}'s turn`;
      else state.message = `${foulReason}. ${state.players[state.turn].name}'s turn`;
    } else if (!foul) {
      state.message = `Nice! ${me.name} continues`;
    }
  }

  return state;
}
