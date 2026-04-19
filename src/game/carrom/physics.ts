import * as CANNON from "cannon-es";
import { BOARD, PIECE, STRIKER, PHYS, POCKETS, type PieceColor } from "./constants";

export interface PieceBody {
  id: string;
  color: PieceColor;
  body: CANNON.Body;
  pocketed: boolean;
}

export interface PhysicsWorld {
  world: CANNON.World;
  pieces: PieceBody[];
  striker: CANNON.Body;
  step: (dt: number) => void;
  isAtRest: () => boolean;
  /** Reset striker to a baseline position */
  setStrikerPosition: (x: number, z: number) => void;
  shoot: (dirX: number, dirZ: number, power01: number) => void;
  /** Returns ids of pieces newly pocketed this step (and whether striker pocketed). Caller updates pocketed flag. */
  checkPockets: () => { piecesPocketed: string[]; strikerPocketed: boolean };
  /** Track first contact for foul detection. Reset before each shot. */
  resetShotLog: () => void;
  getShotLog: () => { firstContact: PieceColor | "striker" | null; hitAny: boolean };
  /** Subscribe to coin-on-coin / striker-on-coin collision events for SFX. Returns unsubscribe. */
  onCollision: (cb: (info: { speed: number; isStrikerHit: boolean }) => void) => () => void;
  destroy: () => void;
}

export function createPhysicsWorld(
  initialLayout: { id: string; color: PieceColor; x: number; z: number }[],
): PhysicsWorld {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.NaiveBroadphase();
  (world.solver as CANNON.GSSolver).iterations = 18;
  world.allowSleep = true;

  // Materials
  const boardMat = new CANNON.Material("board");
  const pieceMat = new CANNON.Material("piece");
  const wallMat = new CANNON.Material("wall");

  world.addContactMaterial(new CANNON.ContactMaterial(boardMat, pieceMat, {
    friction: PHYS.friction, restitution: 0.0,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(pieceMat, pieceMat, {
    friction: 0.02, restitution: 0.96,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(pieceMat, wallMat, {
    friction: 0.01, restitution: PHYS.restitution,
  }));

  // Floor
  const floorShape = new CANNON.Plane();
  const floorBody = new CANNON.Body({ mass: 0, material: boardMat });
  floorBody.addShape(floorShape);
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);

  // Walls (4 sides) — thick & tall so fast pieces never tunnel through
  const wallH = 1.5;
  const wallT = 0.6;
  const wallLen = BOARD.size + wallT * 2 + 0.5;
  const halfPlusGap = BOARD.half + 0.05;
  const makeWall = (x: number, z: number, sx: number, sz: number) => {
    const shape = new CANNON.Box(new CANNON.Vec3(sx, wallH, sz));
    const body = new CANNON.Body({ mass: 0, material: wallMat });
    body.addShape(shape);
    body.position.set(x, wallH, z);
    world.addBody(body);
  };
  makeWall(0,  halfPlusGap + wallT / 2, wallLen / 2, wallT / 2);
  makeWall(0, -halfPlusGap - wallT / 2, wallLen / 2, wallT / 2);
  makeWall( halfPlusGap + wallT / 2, 0, wallT / 2, wallLen / 2);
  makeWall(-halfPlusGap - wallT / 2, 0, wallT / 2, wallLen / 2);

  // Pieces (locked to slide only — no flipping/tipping)
  const pieces: PieceBody[] = initialLayout.map(p => {
    const shape = new CANNON.Cylinder(PIECE.radius, PIECE.radius, PIECE.height, 16);
    const body = new CANNON.Body({
      mass: PIECE.mass,
      material: pieceMat,
      linearDamping: PHYS.pieceLinearDamping,
      angularDamping: PHYS.pieceAngularDamping,
      allowSleep: true,
      sleepSpeedLimit: 0.05,
      sleepTimeLimit: 0.3,
    });
    body.addShape(shape);
    body.position.set(p.x, PIECE.height / 2 + 0.01, p.z);
    // Lock vertical motion + tipping: only XZ translation and Y-axis spin allowed
    body.linearFactor.set(1, 0, 1);
    body.angularFactor.set(0, 1, 0);
    (body as any).ccdSpeedThreshold = 1;
    (body as any).ccdIterations = 5;
    world.addBody(body);
    return { id: p.id, color: p.color, body, pocketed: false };
  });

  // Striker
  const strikerShape = new CANNON.Cylinder(STRIKER.radius, STRIKER.radius, STRIKER.height, 20);
  const striker = new CANNON.Body({
    mass: STRIKER.mass,
    material: pieceMat,
    linearDamping: PHYS.strikerLinearDamping,
    angularDamping: 0.6,
    allowSleep: true,
    sleepSpeedLimit: 0.05,
    sleepTimeLimit: 0.3,
  });
  striker.addShape(strikerShape);
  striker.position.set(0, STRIKER.height / 2 + 0.01, BOARD.baselineY);
  striker.linearFactor.set(1, 0, 1);
  striker.angularFactor.set(0, 1, 0);
  (striker as any).ccdSpeedThreshold = 1;
  (striker as any).ccdIterations = 5;
  world.addBody(striker);

  // Shot log: first contact tracking
  let firstContact: PieceColor | "striker" | null = null;
  let hitAny = false;
  striker.addEventListener("collide", (e: any) => {
    hitAny = true;
    if (firstContact !== null) return;
    const other = e.body as CANNON.Body;
    const piece = pieces.find(p => p.body === other);
    if (piece) firstContact = piece.color;
  });

  return {
    world,
    pieces,
    striker,
    step(dt: number) {
      // Clamp speeds to keep solver stable & prevent tunneling
      const MAX_SPEED = 60;
      const clamp = (b: CANNON.Body) => {
        const sp = b.velocity.length();
        if (sp > MAX_SPEED) b.velocity.scale(MAX_SPEED / sp, b.velocity);
      };
      clamp(striker);
      for (const p of pieces) if (!p.pocketed) clamp(p.body);

      world.step(1 / 120, dt, 6);

      // Safety net: if a body somehow escaped the play area, snap it back inside
      const limit = BOARD.half - PIECE.radius - 0.02;
      const snap = (b: CANNON.Body, r: number) => {
        const lim = BOARD.half - r - 0.02;
        let changed = false;
        if (b.position.x > lim)  { b.position.x = lim;  b.velocity.x = -Math.abs(b.velocity.x) * 0.4; changed = true; }
        if (b.position.x < -lim) { b.position.x = -lim; b.velocity.x =  Math.abs(b.velocity.x) * 0.4; changed = true; }
        if (b.position.z > lim)  { b.position.z = lim;  b.velocity.z = -Math.abs(b.velocity.z) * 0.4; changed = true; }
        if (b.position.z < -lim) { b.position.z = -lim; b.velocity.z =  Math.abs(b.velocity.z) * 0.4; changed = true; }
        if (changed) b.wakeUp();
      };
      for (const p of pieces) if (!p.pocketed) snap(p.body, PIECE.radius);
      snap(striker, STRIKER.radius);
    },
    isAtRest() {
      const speed = (b: CANNON.Body) => b.velocity.length() + b.angularVelocity.length() * 0.1;
      if (speed(striker) > PHYS.restThreshold) return false;
      for (const p of pieces) {
        if (p.pocketed) continue;
        if (speed(p.body) > PHYS.restThreshold) return false;
      }
      return true;
    },
    setStrikerPosition(x, z) {
      striker.position.set(x, STRIKER.height / 2 + 0.01, z);
      striker.velocity.set(0, 0, 0);
      striker.angularVelocity.set(0, 0, 0);
      striker.quaternion.set(0, 0, 0, 1);
      striker.wakeUp();
    },
    shoot(dirX, dirZ, power01) {
      const len = Math.hypot(dirX, dirZ) || 1;
      const ndx = dirX / len;
      const ndz = dirZ / len;
      const impulse = Math.max(0.05, Math.min(1, power01)) * PHYS.maxShotImpulse;
      striker.wakeUp();
      striker.applyImpulse(
        new CANNON.Vec3(ndx * impulse, 0, ndz * impulse),
        new CANNON.Vec3(0, 0, 0),
      );
    },
    checkPockets() {
      const piecesPocketed: string[] = [];
      let strikerPocketed = false;
      const checkBody = (b: CANNON.Body) => {
        for (const [px, pz] of POCKETS) {
          const dx = b.position.x - px;
          const dz = b.position.z - pz;
          if (dx * dx + dz * dz < BOARD.pocketRadius * BOARD.pocketRadius) return true;
        }
        return false;
      };
      for (const p of pieces) {
        if (p.pocketed) continue;
        if (checkBody(p.body)) {
          piecesPocketed.push(p.id);
          p.pocketed = true;
          // Move below floor so it's out of the way
          p.body.position.set(20 + Math.random(), -5, 20);
          p.body.velocity.set(0, 0, 0);
          p.body.angularVelocity.set(0, 0, 0);
          p.body.sleep();
        }
      }
      if (checkBody(striker)) {
        strikerPocketed = true;
      }
      return { piecesPocketed, strikerPocketed };
    },
    resetShotLog() { firstContact = null; hitAny = false; },
    getShotLog() { return { firstContact, hitAny }; },
    destroy() {
      // cannon-es has no explicit teardown; let GC handle.
    },
  };
}
