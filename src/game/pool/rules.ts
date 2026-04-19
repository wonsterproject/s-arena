import { initialBalls, HEAD_SPOT_X } from "./constants";
import type { Ball, MatchState, ShotResult, Group } from "./types";

export function createMatch(p1: string, p2: string, botSide: 0 | 1 | null): MatchState {
  const init = initialBalls();
  const balls: Ball[] = init.map(b => ({ ...b, vx: 0, vz: 0, pocketed: false }));
  return {
    players: [
      { name: p1, isBot: botSide === 0, group: null, pottedCount: 0 },
      { name: p2, isBot: botSide === 1, group: null, pottedCount: 0 },
    ],
    turn: 0,
    balls,
    ballInHand: false,
    message: `${p1} breaks — drag cue ball to aim, slider for power.`,
    winner: null,
    shotInProgress: false,
  };
}

function groupOf(id: number): Group | null {
  if (id === 0 || id === 8) return null;
  return id < 8 ? "solid" : "stripe";
}

export function resolveShot(state: MatchState, result: ShotResult): MatchState {
  const next: MatchState = JSON.parse(JSON.stringify(state));
  const me = next.players[next.turn];
  const opp = next.players[next.turn === 0 ? 1 : 0];

  const pocketedNonCue = result.pocketedIds.filter(id => id !== 0);
  const eightPocketed = pocketedNonCue.includes(8);
  const myCleared = me.group ? next.balls.filter(b => groupOf(b.id) === me.group && b.pocketed && b.id !== 8).length === 7 : false;

  // 1) 8-ball handling first
  if (eightPocketed) {
    if (myCleared && !result.cuePocketed) {
      next.winner = next.turn;
      next.message = `${me.name} pots the 8-ball and wins!`;
      next.shotInProgress = false;
      return next;
    } else {
      // Loss: pocketed 8 too early or with scratch
      next.winner = next.turn === 0 ? 1 : 0;
      next.message = `${me.name} pocketed the 8-ball illegally — ${opp.name} wins.`;
      next.shotInProgress = false;
      return next;
    }
  }

  // 2) Foul detection
  let foul = false;
  let foulReason = "";
  if (result.cuePocketed) { foul = true; foulReason = "Scratch (cue pocketed)"; }
  else if (!result.hitAny || result.firstContactId === null) { foul = true; foulReason = "No ball hit"; }
  else if (me.group && groupOf(result.firstContactId) !== me.group && result.firstContactId !== 8) {
    foul = true; foulReason = "Wrong ball hit first";
  } else if (me.group && me.group && !myCleared && result.firstContactId === 8) {
    foul = true; foulReason = "Hit 8-ball before clearing your group";
  } else if (pocketedNonCue.length === 0 && !result.cushionAfterContact) {
    foul = true; foulReason = "No cushion after contact";
  }

  // 3) Group assignment on first legal pot (open table)
  const noGroupsYet = me.group === null && opp.group === null;
  if (noGroupsYet && pocketedNonCue.length > 0 && !foul) {
    // Pick the group of the first non-8 pocketed ball
    const firstPotted = pocketedNonCue.find(id => id !== 8);
    if (firstPotted !== undefined) {
      const g = groupOf(firstPotted)!;
      me.group = g;
      opp.group = g === "solid" ? "stripe" : "solid";
    }
  }

  // 4) Update potted counts
  for (const id of pocketedNonCue) {
    if (id === 8) continue;
    const g = groupOf(id);
    if (g && me.group === g) me.pottedCount++;
    else if (g && opp.group === g) opp.pottedCount++;
    else if (!me.group && !opp.group) {
      // open table — count after assignment above
      const g2 = groupOf(id);
      if (g2 && me.group === g2) me.pottedCount++;
      else if (g2 && opp.group === g2) opp.pottedCount++;
    }
  }

  // 5) Recompute potted counts authoritatively from board (simpler & safer)
  if (me.group) me.pottedCount = next.balls.filter(b => groupOf(b.id) === me.group && b.pocketed).length;
  if (opp.group) opp.pottedCount = next.balls.filter(b => groupOf(b.id) === opp.group && b.pocketed).length;

  // 6) Reset cue ball if scratched
  if (result.cuePocketed) {
    const cue = next.balls.find(b => b.id === 0)!;
    cue.pocketed = false;
    cue.x = HEAD_SPOT_X;
    cue.z = 0;
    cue.vx = 0; cue.vz = 0;
  }

  // 7) Decide turn change
  let keepTurn = false;
  if (!foul) {
    // Continue turn if pocketed at least one of own group (or any on open table)
    if (me.group) {
      const ownPotted = pocketedNonCue.some(id => groupOf(id) === me.group);
      if (ownPotted) keepTurn = true;
    } else if (pocketedNonCue.length > 0) {
      keepTurn = true;
    }
  }

  if (foul) {
    next.ballInHand = true;
    next.turn = next.turn === 0 ? 1 : 0;
    next.message = `Foul: ${foulReason}. ${next.players[next.turn].name} has ball-in-hand.`;
  } else if (keepTurn) {
    next.ballInHand = false;
    next.message = `${me.name} pocketed${pocketedNonCue.length > 1 ? " " + pocketedNonCue.length : ""} — shoot again.`;
  } else {
    next.ballInHand = false;
    next.turn = next.turn === 0 ? 1 : 0;
    next.message = `${next.players[next.turn].name}'s turn.`;
  }

  next.shotInProgress = false;
  return next;
}
