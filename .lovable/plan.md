
Building a professional 8-Ball Pool game with full physics, rules, and AI bot — replacing the current "Coming Soon" placeholder.

## What I'll build

A complete 3D 8-Ball Pool game following the same architecture as Carrom (which already uses three.js + custom physics). Same UI/UX patterns as Ludo/Chess/Carrom for consistency.

## Game features

**Core gameplay**
- 16 balls: cue ball, 1–7 solids, 8-ball, 9–15 stripes
- Standard triangle rack, head-string break
- Aim with mouse/touch drag, power meter, shoot
- Top-down 3D table with realistic felt, rails, 6 pockets

**Physics (custom 2D, like Carrom)**
- Ball-ball elastic collision with friction
- Ball-rail bounce with restitution
- Pocket detection (corner + side pockets)
- Friction decay → balls settle → next turn

**Full 8-ball rules**
- Open table until first legal pot assigns solids/stripes
- Foul detection: cue ball pocketed (scratch), wrong ball first contact, no rail after contact, 8-ball pocketed early
- Ball-in-hand after foul (drag cue anywhere legal)
- Win: pot 8-ball legally after clearing your group
- Loss: pot 8-ball early or scratch on 8-ball

**Bot opponent**
- Picks best legal shot: nearest own-group ball to a pocket
- Aims with small randomized error scaled by difficulty
- Power chosen by distance

**UI (mobile-first, dark theme matching arena)**
- Aim line preview, power slider, shoot button
- Player cards (you / bot) with assigned group (solids/stripes) + remaining count
- Turn indicator, foul/scratch toasts
- Win modal with coin reward (same flow as Carrom/Ludo)
- Exit button back to hub

## Files to create

```text
src/game/pool/
  constants.ts      // table size, ball radius, pockets, friction, restitution
  types.ts          // BallState, MatchState, ShotEvent, Group
  physics.ts        // step(), collisions, pocket check, settle detection
  rules.ts          // foul logic, group assignment, win/loss, ball-in-hand
  bot.ts            // pickShot() — target ball + angle + power

src/components/pool/
  PoolScene.tsx     // react-three-fiber canvas: table, rails, pockets, balls, cue stick, aim line
  AimControls.tsx   // touch/mouse aim + power slider + shoot button
  PoolHUD.tsx       // player cards, turn indicator, group display

src/pages/pool/
  PoolLobby.tsx     // mirrors CarromLobby — Play vs Bot / Random / Friend (Bot only initially)
  PoolMatch.tsx     // wires scene + HUD + match state, handles win → coin payout
```

## Files to modify

- `src/App.tsx` — replace `/pool/lobby` ComingSoon route with `PoolLobby`, add `/pool/play` → `PoolMatch`
- `src/pages/Hub.tsx` — change pool card status from `"soon"` to `"live"`

## Tech notes

- Reuse `@react-three/fiber@^8.18` + `@react-three/drei@^9.122` already in project (used by Carrom)
- Reuse `useSounds` hook for hit/pocket sounds
- Reuse `useAuth` + Supabase coin update pattern from CarromMatch
- Custom 2D physics in top-down view (z = up for visuals only) — proven to work well from Carrom
- Single-player vs bot for v1 (no realtime multiplayer to keep scope tight); friend/random can be added later

## Out of scope (v1)

- Online realtime multiplayer (vs friend / random) — shown as "Coming Soon" in pool lobby for now
- Cue spin/english (advanced) — straight shots only, can add later
- Custom cue skins / table themes

After approval I'll implement everything, wire it into the hub, and you can test Play vs Bot end-to-end.
