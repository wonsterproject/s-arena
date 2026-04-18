import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { createPhysicsWorld, type PhysicsWorld } from "@/game/carrom/physics";
import { BOARD, PIECE, STRIKER, POCKETS, initialPieces, type PieceColor } from "@/game/carrom/constants";

interface Props {
  /** Called once with the physics handle so parent can drive shots */
  onReady: (api: CarromSceneApi) => void;
  /** Called whenever the simulation comes to rest after a shot */
  onShotResolved: (info: { piecesPocketed: string[]; strikerPocketed: boolean; hitAny: boolean; firstContact: PieceColor | "striker" | null }) => void;
  /** Whose turn (for striker baseline placement & color hint) */
  currentSide: 0 | 1;
  /** True while shot is in flight (disables drag) */
  shooting: boolean;
}

export interface CarromSceneApi {
  setStrikerPosition: (x: number, z: number) => void;
  shoot: (dirX: number, dirZ: number, power01: number) => void;
  /** Re-add queen to center if cover failed */
  respawnQueen: () => void;
  getStrikerPos: () => { x: number; z: number };
}

export default function CarromScene(props: Props) {
  return (
    <Canvas shadows dpr={[1, 2]} className="rounded-2xl">
      <PerspectiveCamera makeDefault position={[0, 9, 8.5]} fov={42} />
      <color attach="background" args={["#1a0f08"]} />
      <fog attach="fog" args={["#1a0f08", 14, 30]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.4} castShadow shadow-mapSize={[2048, 2048]} />
      <Environment preset="warehouse" />
      <SceneInner {...props} />
      <OrbitControls
        enablePan={false}
        minDistance={7}
        maxDistance={16}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.2}
      />
    </Canvas>
  );
}

function SceneInner({ onReady, onShotResolved, currentSide, shooting }: Props) {
  const phys = useMemo<PhysicsWorld>(() => createPhysicsWorld(initialPieces()), []);
  const pieceMeshes = useRef<Map<string, THREE.Mesh>>(new Map());
  const strikerMesh = useRef<THREE.Mesh>(null!);
  const shotInProgress = useRef(false);
  const shotTimer = useRef(0);
  const restCounter = useRef(0);

  // API exposed once
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
    onReady(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    phys.step(dt);

    // sync meshes
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

    // shot resolution
    if (shotInProgress.current) {
      shotTimer.current += dt;
      if (phys.isAtRest()) {
        restCounter.current += dt;
        if (restCounter.current > 0.25 || shotTimer.current > 8) {
          shotInProgress.current = false;
          const { piecesPocketed, strikerPocketed } = phys.checkPockets();
          const log = phys.getShotLog();
          // Final rest pocket-check happens after step too — call again to catch settles
          onShotResolved({
            piecesPocketed,
            strikerPocketed,
            hitAny: log.hitAny,
            firstContact: log.firstContact,
          });
        }
      } else {
        restCounter.current = 0;
        // Check pockets each frame so animations look right
        phys.checkPockets();
      }
    }
  });

  return (
    <group>
      {/* Board */}
      <mesh receiveShadow position={[0, -BOARD.thickness / 2, 0]}>
        <boxGeometry args={[BOARD.size + 0.6, BOARD.thickness, BOARD.size + 0.6]} />
        <meshStandardMaterial color="#5a3a1f" roughness={0.7} />
      </mesh>
      {/* Playing surface */}
      <mesh receiveShadow position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD.size, BOARD.size]} />
        <meshStandardMaterial color="#e8c98a" roughness={0.85} />
      </mesh>
      {/* Center decorative circle */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.6, 48]} />
        <meshBasicMaterial color="#8b5a2b" />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.2, 32]} />
        <meshBasicMaterial color="#c0392b" />
      </mesh>

      {/* Baselines */}
      {[BOARD.baselineY, -BOARD.baselineY].map((z, i) => (
        <mesh key={i} position={[0, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[BOARD.baselineHalfWidth * 2, 0.04]} />
          <meshBasicMaterial color={i === currentSide ? "#10b981" : "#475569"} />
        </mesh>
      ))}

      {/* Pockets */}
      {POCKETS.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[BOARD.pocketRadius, 32]} />
          <meshBasicMaterial color="#0a0a0a" />
        </mesh>
      ))}

      {/* Pieces */}
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

      {/* Striker */}
      <mesh ref={strikerMesh} castShadow>
        <cylinderGeometry args={[STRIKER.radius, STRIKER.radius, STRIKER.height, 28]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.3} metalness={0.5} emissive="#92400e" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}
