import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { createPhysicsWorld, type PhysicsWorld } from "@/game/carrom/physics";
import { BOARD, PIECE, STRIKER, POCKETS, initialPieces, type PieceColor } from "@/game/carrom/constants";

interface Props {
  onReady: (api: CarromSceneApi) => void;
  onShotResolved: (info: { piecesPocketed: string[]; strikerPocketed: boolean; hitAny: boolean; firstContact: PieceColor | "striker" | null }) => void;
  currentSide: 0 | 1;
  shooting: boolean;
  /** Human can interact (drag striker) right now */
  interactive: boolean;
  /** Called when user finishes drag and releases — parent commits the shot */
  onShootRequest: (dirX: number, dirZ: number, power01: number, strikerX: number, strikerZ: number) => void;
}

export interface CarromSceneApi {
  setStrikerPosition: (x: number, z: number) => void;
  shoot: (dirX: number, dirZ: number, power01: number) => void;
  respawnQueen: () => void;
  getStrikerPos: () => { x: number; z: number };
}

export default function CarromScene(props: Props) {
  return (
    <Canvas shadows dpr={[1, 2]} className="rounded-2xl touch-none" orthographic camera={{ position: [0, 10, 0.001], zoom: 55, near: 0.1, far: 100 }}>
      <color attach="background" args={["#1a0f08"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[-5, 8, -5]} intensity={0.4} />
      <SceneInner {...props} />
    </Canvas>
  );
}

type DragMode = null | "positioning" | "aiming";

function SceneInner({ onReady, onShotResolved, currentSide, shooting, interactive, onShootRequest }: Props) {
  const phys = useMemo<PhysicsWorld>(() => createPhysicsWorld(initialPieces()), []);
  const pieceMeshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const strikerMesh = useRef<THREE.Mesh>(null!);
  const aimLine = useRef<THREE.Line>(null!);
  const powerArc = useRef<THREE.Mesh>(null!);
  const shotInProgress = useRef(false);
  const shotTimer = useRef(0);
  const restCounter = useRef(0);

  const { camera, gl } = useThree();
  const dragMode = useRef<DragMode>(null);
  const dragStart = useRef<{ x: number; z: number } | null>(null);
  const aimVec = useRef<{ dx: number; dz: number; power: number } | null>(null);
  const baselineZ = useRef(currentSide === 0 ? BOARD.baselineY : -BOARD.baselineY);

  useEffect(() => {
    baselineZ.current = currentSide === 0 ? BOARD.baselineY : -BOARD.baselineY;
  }, [currentSide]);

  // API
  useEffect(() => {
    const api: CarromSceneApi = {
      setStrikerPosition: (x, z) => phys.setStrikerPosition(x, z),
      shoot: (dx, dz, p) => {
        phys.resetShotLog();
        phys.shoot(dx, dz, p);
        shotInProgress.current = true;
        shotTimer.current = 0;
        restCounter.current = 0;
      },
      respawnQueen: () => {
        const q = phys.pieces.find(p => p.color === "queen");
        if (q) {
          q.pocketed = false;
          q.body.position.set(0, PIECE.height / 2 + 0.01, 0);
          q.body.velocity.set(0, 0, 0);
          q.body.angularVelocity.set(0, 0, 0);
          q.body.wakeUp();
        }
      },
      getStrikerPos: () => ({ x: phys.striker.position.x, z: phys.striker.position.z }),
    };
    (api as any)._piecesSnapshot = () => phys.pieces.map(p => ({
      id: p.id, color: p.color, pocketed: p.pocketed,
      x: p.body.position.x, z: p.body.position.z,
    }));
    onReady(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer → world plane (y=0) intersection
  const planePoint = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const pointerToWorld = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const out = new THREE.Vector3();
    if (ray.ray.intersectPlane(groundPlane, out)) return out;
    return null;
  };

  // Pointer event handlers
  useEffect(() => {
    const dom = gl.domElement;

    const onDown = (e: PointerEvent) => {
      if (!interactive || shooting || shotInProgress.current) return;
      const wp = pointerToWorld(e.clientX, e.clientY);
      if (!wp) return;
      const sx = phys.striker.position.x;
      const sz = phys.striker.position.z;
      const dist = Math.hypot(wp.x - sx, wp.z - sz);
      // Hit-test: must touch within ~3x striker radius for forgiveness on mobile
      if (dist > STRIKER.radius * 3.5) return;
      dom.setPointerCapture(e.pointerId);
      dragMode.current = "positioning";
      dragStart.current = { x: wp.x, z: wp.z };
      aimVec.current = null;
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!dragMode.current) return;
      const wp = pointerToWorld(e.clientX, e.clientY);
      if (!wp || !dragStart.current) return;

      if (dragMode.current === "positioning") {
        // Allow left-right slide along baseline; pulling back toward our side switches to aim mode
        const sideSign = baselineZ.current > 0 ? 1 : -1;
        const pullBack = (wp.z - baselineZ.current) * sideSign; // positive when pulled toward our side (away from board center)
        if (pullBack > STRIKER.radius * 0.6) {
          // Switch to aim mode — record anchor at current striker position
          dragMode.current = "aiming";
          dragStart.current = { x: phys.striker.position.x, z: phys.striker.position.z };
        } else {
          // Slide along baseline (clamp x)
          const clampedX = Math.max(-BOARD.baselineHalfWidth, Math.min(BOARD.baselineHalfWidth, wp.x));
          phys.setStrikerPosition(clampedX, baselineZ.current);
        }
      }

      if (dragMode.current === "aiming" && dragStart.current) {
        // Vector from current pointer back to striker = SHOOT direction (reverse of pull)
        const sx = dragStart.current.x;
        const sz = dragStart.current.z;
        const pullDX = wp.x - sx;
        const pullDZ = wp.z - sz;
        const pullLen = Math.hypot(pullDX, pullDZ);
        if (pullLen < 0.05) { aimVec.current = null; return; }
        const dirX = -pullDX / pullLen;
        const dirZ = -pullDZ / pullLen;
        // Power scales with pull distance, capped
        const maxPull = 3.5;
        const power = Math.max(0.1, Math.min(1, pullLen / maxPull));
        aimVec.current = { dx: dirX, dz: dirZ, power };
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!dragMode.current) return;
      try { dom.releasePointerCapture(e.pointerId); } catch {}
      const mode = dragMode.current;
      const aim = aimVec.current;
      dragMode.current = null;
      dragStart.current = null;
      aimVec.current = null;

      if (mode === "aiming" && aim) {
        const sx = phys.striker.position.x;
        const sz = phys.striker.position.z;
        onShootRequest(aim.dx, aim.dz, aim.power, sx, sz);
      }
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
    };
  }, [gl, camera, interactive, shooting, phys, onShootRequest]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    phys.step(dt);

    for (const p of phys.pieces) {
      const mesh = pieceMeshes.current.get(p.id);
      if (!mesh) continue;
      if (p.pocketed) { mesh.visible = false; continue; }
      mesh.visible = true;
      mesh.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
      mesh.quaternion.set(p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w);
    }
    if (strikerMesh.current) {
      strikerMesh.current.position.set(phys.striker.position.x, phys.striker.position.y, phys.striker.position.z);
      strikerMesh.current.quaternion.set(phys.striker.quaternion.x, phys.striker.quaternion.y, phys.striker.quaternion.z, phys.striker.quaternion.w);
    }

    // Update aim line + power indicator
    if (aimLine.current && powerArc.current) {
      const aim = aimVec.current;
      if (aim && interactive && !shooting && !shotInProgress.current) {
        const sx = phys.striker.position.x;
        const sz = phys.striker.position.z;
        const len = 1 + aim.power * 6;
        const positions = aimLine.current.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, sx, 0.05, sz);
        positions.setXYZ(1, sx + aim.dx * len, 0.05, sz + aim.dz * len);
        positions.needsUpdate = true;
        aimLine.current.visible = true;
        // Color by power: green → yellow → red
        const hue = (1 - aim.power) * 0.33; // 0.33=green, 0=red
        (aimLine.current.material as THREE.LineBasicMaterial).color.setHSL(hue, 1, 0.55);
        // Power ring around striker
        powerArc.current.position.set(sx, 0.04, sz);
        const ringScale = 1 + aim.power * 1.5;
        powerArc.current.scale.set(ringScale, ringScale, 1);
        (powerArc.current.material as THREE.MeshBasicMaterial).color.setHSL(hue, 1, 0.5);
        (powerArc.current.material as THREE.MeshBasicMaterial).opacity = 0.45 + aim.power * 0.4;
        powerArc.current.visible = true;
      } else {
        aimLine.current.visible = false;
        powerArc.current.visible = false;
      }
    }

    if (shotInProgress.current) {
      shotTimer.current += dt;
      if (phys.isAtRest()) {
        restCounter.current += dt;
        if (restCounter.current > 0.25 || shotTimer.current > 8) {
          shotInProgress.current = false;
          const { piecesPocketed, strikerPocketed } = phys.checkPockets();
          const log = phys.getShotLog();
          onShotResolved({
            piecesPocketed,
            strikerPocketed,
            hitAny: log.hitAny,
            firstContact: log.firstContact,
          });
        }
      } else {
        restCounter.current = 0;
        phys.checkPockets();
      }
    }
  });

  // Aim line geometry
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);

  return (
    <group>
      {/* Board */}
      <mesh receiveShadow position={[0, -BOARD.thickness / 2, 0]}>
        <boxGeometry args={[BOARD.size + 0.6, BOARD.thickness, BOARD.size + 0.6]} />
        <meshStandardMaterial color="#5a3a1f" roughness={0.7} />
      </mesh>
      <mesh receiveShadow position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD.size, BOARD.size]} />
        <meshStandardMaterial color="#e8c98a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.6, 48]} />
        <meshBasicMaterial color="#8b5a2b" />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.2, 32]} />
        <meshBasicMaterial color="#c0392b" />
      </mesh>

      {[BOARD.baselineY, -BOARD.baselineY].map((z, i) => (
        <mesh key={i} position={[0, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BOARD.baselineHalfWidth * 2, 0.04]} />
          <meshBasicMaterial color={i === currentSide ? "#10b981" : "#475569"} />
        </mesh>
      ))}

      {POCKETS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[BOARD.pocketRadius, 32]} />
          <meshBasicMaterial color="#0a0a0a" />
        </mesh>
      ))}

      {phys.pieces.map(p => (
        <mesh
          key={p.id}
          ref={(m) => { if (m) pieceMeshes.current.set(p.id, m); }}
          castShadow
        >
          <cylinderGeometry args={[PIECE.radius, PIECE.radius, PIECE.height, 24]} />
          <meshStandardMaterial
            color={p.color === "white" ? "#f5f1e6" : p.color === "black" ? "#1a1a1a" : "#dc2626"}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
      ))}

      <mesh ref={strikerMesh} castShadow>
        <cylinderGeometry args={[STRIKER.radius, STRIKER.radius, STRIKER.height, 28]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.5} emissive="#92400e" emissiveIntensity={0.15} />
      </mesh>

      {/* Aim line */}
      {/* @ts-ignore — three Line element */}
      <line ref={aimLine as any} geometry={lineGeo} visible={false}>
        <lineBasicMaterial color="#10b981" linewidth={3} transparent opacity={0.9} />
      </line>

      {/* Power ring around striker */}
      <mesh ref={powerArc} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[STRIKER.radius + 0.05, STRIKER.radius + 0.12, 48]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
