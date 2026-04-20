import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ARENA, COVERS, PLAYER, WEAPON } from "@/game/arena/constants";
import type { ArenaState } from "@/game/arena/engine";

interface Props {
  state: ArenaState;
  selfId: string;
  ads: boolean;
}

/**
 * Three.js TPP scene — vanilla three (no react-three-fiber dep needed for the heavy stuff).
 * Renders arena, characters, tracers, muzzle flashes; updated each frame from state ref.
 */
export function ArenaScene({ state, selfId, ads }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const adsRef = useRef(ads);
  stateRef.current = state;
  adsRef.current = ads;

  useEffect(() => {
    const mount = mountRef.current!;
    const w = mount.clientWidth, h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1020");
    scene.fog = new THREE.Fog("#0b1020", 30, 70);

    const camera = new THREE.PerspectiveCamera(75, w / h, 0.05, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // Lights
    const hemi = new THREE.HemisphereLight(0x88aaff, 0x101418, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.2);
    sun.position.set(20, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -ARENA.size;
    sun.shadow.camera.right = ARENA.size;
    sun.shadow.camera.top = ARENA.size;
    sun.shadow.camera.bottom = -ARENA.size;
    scene.add(sun);

    // Floor — concrete-like with grid
    const floorGeo = new THREE.PlaneGeometry(ARENA.size * 2, ARENA.size * 2, 1, 1);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2c3344, roughness: 0.95, metalness: 0.05 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid overlay
    const grid = new THREE.GridHelper(ARENA.size * 2, 28, 0x4a5b88, 0x1d2540);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.02;
    scene.add(grid);

    // Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b2236, roughness: 0.7, metalness: 0.2 });
    const wallSpecs = [
      { x: 0, z: -ARENA.size, w: ARENA.size * 2 + 0.5, d: 0.5 },
      { x: 0, z:  ARENA.size, w: ARENA.size * 2 + 0.5, d: 0.5 },
      { x: -ARENA.size, z: 0, w: 0.5, d: ARENA.size * 2 + 0.5 },
      { x:  ARENA.size, z: 0, w: 0.5, d: ARENA.size * 2 + 0.5 },
    ];
    for (const s of wallSpecs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, ARENA.wallH, s.d), wallMat);
      m.position.set(s.x, ARENA.wallH / 2, s.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }

    // Wall accent strips (neon)
    const accentMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    for (const s of wallSpecs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.06, s.d), accentMat);
      m.position.set(s.x, ARENA.wallH - 0.5, s.z);
      scene.add(m);
    }

    // Covers
    const coverMat = new THREE.MeshStandardMaterial({ color: 0x394869, roughness: 0.6, metalness: 0.3 });
    const coverEdgeMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
    for (const c of COVERS) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), coverMat);
      m.position.set(c.x, c.h / 2, c.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      const top = new THREE.Mesh(new THREE.BoxGeometry(c.w, 0.05, c.d), coverEdgeMat);
      top.position.set(c.x, c.h + 0.025, c.z);
      scene.add(top);
    }

    // Spawn pads
    const padMat1 = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45 });
    const padMat2 = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.45 });
    const padGeo = new THREE.RingGeometry(0.9, 1.1, 32);
    const pad1 = new THREE.Mesh(padGeo, padMat1); pad1.rotation.x = -Math.PI / 2; pad1.position.set(-22, 0.03, -22); scene.add(pad1);
    const pad2 = new THREE.Mesh(padGeo, padMat1); pad2.rotation.x = -Math.PI / 2; pad2.position.set(-22, 0.03,  22); scene.add(pad2);
    const pad3 = new THREE.Mesh(padGeo, padMat2); pad3.rotation.x = -Math.PI / 2; pad3.position.set( 22, 0.03,  22); scene.add(pad3);
    const pad4 = new THREE.Mesh(padGeo, padMat2); pad4.rotation.x = -Math.PI / 2; pad4.position.set( 22, 0.03, -22); scene.add(pad4);

    // ---------------------------------------------------------------
    // Military humanoid character: head + helmet + torso (vest) + arms
    // (upper+forearm) + legs (thigh+shin) + boots + rifle in hands.
    // Limbs are pivoted groups so we can animate swing while moving.
    // ---------------------------------------------------------------
    type CharRig = {
      group: THREE.Group;
      torso: THREE.Group;
      head: THREE.Mesh;
      leftArm: THREE.Group;   // shoulder pivot
      rightArm: THREE.Group;  // shoulder pivot (holds rifle)
      leftLeg: THREE.Group;   // hip pivot
      rightLeg: THREE.Group;  // hip pivot
      gun: THREE.Group;
      muzzle: THREE.Object3D;
      hpFill: THREE.Mesh;
      hpBg: THREE.Mesh;
    };
    const characters = new Map<string, CharRig>();

    function makeChar(teamColor: number): CharRig {
      const grp = new THREE.Group();

      // Materials — military fatigues + gear
      const fatigueColor = teamColor === 0x22d3ee
        ? new THREE.Color(0x3b5132)  // olive drab for ally
        : new THREE.Color(0x4a3a26); // desert tan for enemy
      const fatigueMat = new THREE.MeshStandardMaterial({ color: fatigueColor, roughness: 0.85, metalness: 0.05 });
      const vestMat   = new THREE.MeshStandardMaterial({ color: 0x2a2f24, roughness: 0.7, metalness: 0.15 });
      const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2f3a26, roughness: 0.55, metalness: 0.25 });
      const skinMat   = new THREE.MeshStandardMaterial({ color: 0xd9b18a, roughness: 0.65 });
      const bootMat   = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.2 });
      const gloveMat  = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
      const teamMat   = new THREE.MeshBasicMaterial({ color: teamColor });
      const gunBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.4, metalness: 0.7 });
      const gunGripMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.6, metalness: 0.3 });

      // Torso (vest over fatigues)
      const torso = new THREE.Group();
      torso.position.y = 1.05;
      const torsoBody = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), fatigueMat);
      torsoBody.castShadow = true;
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.55, 0.38), vestMat);
      vest.position.y = 0.05;
      vest.castShadow = true;
      // Pouches on vest
      const pouch1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), vestMat);
      pouch1.position.set(-0.14, -0.05, 0.21);
      const pouch2 = pouch1.clone(); pouch2.position.x = 0.14;
      // Team armband
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.36), teamMat);
      band.position.set(-0.32, 0.05, 0);
      torso.add(torsoBody, vest, pouch1, pouch2, band);

      // Head + helmet
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), skinMat);
      head.position.y = 1.62;
      head.castShadow = true;
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), helmetMat);
      helmet.position.y = 1.66;
      helmet.castShadow = true;
      const helmetRim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 24), helmetMat);
      helmetRim.rotation.x = Math.PI / 2;
      helmetRim.position.y = 1.6;

      // Arms — shoulder pivot groups so we can rotate forearm too
      const upperArmGeo = new THREE.CapsuleGeometry(0.08, 0.32, 4, 8);
      const forearmGeo  = new THREE.CapsuleGeometry(0.075, 0.3, 4, 8);
      const handGeo     = new THREE.SphereGeometry(0.085, 10, 8);

      const makeArm = (side: -1 | 1) => {
        const shoulder = new THREE.Group();
        shoulder.position.set(0.32 * side, 1.38, 0);
        const upper = new THREE.Mesh(upperArmGeo, fatigueMat);
        upper.position.y = -0.18;
        upper.castShadow = true;
        const elbow = new THREE.Group();
        elbow.position.y = -0.36;
        const fore = new THREE.Mesh(forearmGeo, fatigueMat);
        fore.position.y = -0.16;
        fore.castShadow = true;
        const hand = new THREE.Mesh(handGeo, gloveMat);
        hand.position.y = -0.34;
        elbow.add(fore, hand);
        shoulder.add(upper, elbow);
        return shoulder;
      };
      const leftArm = makeArm(-1);
      const rightArm = makeArm(1);

      // Legs — hip pivot groups with knee
      const thighGeo = new THREE.CapsuleGeometry(0.105, 0.42, 4, 8);
      const shinGeo  = new THREE.CapsuleGeometry(0.095, 0.4, 4, 8);
      const bootGeo  = new THREE.BoxGeometry(0.18, 0.1, 0.28);

      const makeLeg = (side: -1 | 1) => {
        const hip = new THREE.Group();
        hip.position.set(0.13 * side, 0.92, 0);
        const thigh = new THREE.Mesh(thighGeo, fatigueMat);
        thigh.position.y = -0.22;
        thigh.castShadow = true;
        const knee = new THREE.Group();
        knee.position.y = -0.46;
        const shin = new THREE.Mesh(shinGeo, fatigueMat);
        shin.position.y = -0.22;
        shin.castShadow = true;
        const boot = new THREE.Mesh(bootGeo, bootMat);
        boot.position.set(0, -0.45, 0.05);
        boot.castShadow = true;
        knee.add(shin, boot);
        hip.add(thigh, knee);
        return hip;
      };
      const leftLeg = makeLeg(-1);
      const rightLeg = makeLeg(1);

      // Rifle — assembled from primitives, parented to right arm so it follows hand
      const gun = new THREE.Group();
      // Body / receiver
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.55), gunBodyMat);
      receiver.castShadow = true;
      // Barrel
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), gunBodyMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.z = 0.5;
      // Foregrip / handguard
      const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.32), gunBodyMat);
      handguard.position.z = 0.34;
      // Magazine
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), gunBodyMat);
      mag.position.set(0, -0.13, 0.05);
      // Pistol grip
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), gunGripMat);
      grip.position.set(0, -0.12, -0.12);
      grip.rotation.x = -0.25;
      // Stock
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.28), gunGripMat);
      stock.position.z = -0.32;
      // Sight
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.1), gunGripMat);
      sight.position.set(0, 0.09, 0.05);
      gun.add(receiver, barrel, handguard, mag, grip, stock, sight);
      // Position rifle in front of right hand area
      gun.position.set(-0.18, -0.36, 0.18);
      gun.rotation.y = -0.15;
      rightArm.add(gun);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0, 0.74);
      gun.add(muzzle);

      // Left hand reaches across to support handguard
      // Move left forearm forward so hand sits on the rifle
      const leftElbow = leftArm.children[1] as THREE.Group;
      leftElbow.rotation.x = -1.1;
      leftArm.rotation.x = -0.5;
      leftArm.rotation.z = 0.35;

      // Right arm posed bringing rifle up
      rightArm.rotation.x = -0.55;
      rightArm.rotation.z = -0.18;
      const rightElbow = rightArm.children[1] as THREE.Group;
      rightElbow.rotation.x = -0.5;

      // HP bar
      const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
      hpBg.position.y = 2.05;
      const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
      hpFill.position.set(0, 2.05, 0.001);

      grp.add(torso, head, helmet, helmetRim, leftArm, rightArm, leftLeg, rightLeg, hpBg, hpFill);

      return { group: grp, torso, head, leftArm, rightArm, leftLeg, rightLeg, gun, muzzle, hpFill, hpBg };
    }

    for (const e of stateRef.current.entities) {
      const ch = makeChar(new THREE.Color(e.color).getHex());
      characters.set(e.id, ch);
      scene.add(ch.group);
    }

    // Tracer pool
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff7c2, transparent: true });
    const tracerGroup = new THREE.Group();
    scene.add(tracerGroup);

    // Muzzle flash pool
    const flashGroup = new THREE.Group();
    scene.add(flashGroup);

    // Resize
    const onResize = () => {
      const W = mount.clientWidth, H = mount.clientHeight;
      renderer.setSize(W, H);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // Camera helper
    const desiredCamPos = new THREE.Vector3();
    const camLookAt = new THREE.Vector3();
    const tmpRay = new THREE.Raycaster();

    let raf = 0;
    let lastT = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const st = stateRef.current;

      // Update characters — limb animation, crouch, aim, recoil
      for (const e of st.entities) {
        const c = characters.get(e.id);
        if (!c) continue;
        c.group.visible = e.alive;
        // Crouch sinks the body ~0.35m
        const crouchSink = e.crouch ? 0.35 : 0;
        c.group.position.set(e.pos.x, e.pos.y - crouchSink, e.pos.z);
        c.group.rotation.y = e.yaw;

        // Pitch the upper body / arms toward aim
        const pitch = e.pitch;
        c.torso.rotation.x = -pitch * 0.35;
        c.head.rotation.x = -pitch * 0.55;
        // Both arms rotate at shoulder for aim
        const aimArmX = -pitch - 0.25;
        c.rightArm.rotation.x = aimArmX - 0.3;
        // Recoil kick
        const sinceFire = now - e.fireFlashAt;
        const kick = sinceFire < 90 ? (1 - sinceFire / 90) * 0.35 : 0;
        c.rightArm.rotation.x -= kick;
        c.gun.position.z = 0.18 - kick * 0.08;

        // Leg / arm swing while moving
        const horiz = Math.hypot(e.vel.x, e.vel.z);
        const moving = horiz > 0.4 && Math.abs(e.pos.y) < 0.05;
        const swing = moving ? Math.sin(e.animPhase) * Math.min(0.7, horiz / 6) : 0;
        const armSwingScale = e.crouch ? 0.25 : 0.5;
        c.leftLeg.rotation.x = swing * 0.9;
        c.rightLeg.rotation.x = -swing * 0.9;
        // bend back knee a bit on the lifted side
        const lkneeRot = Math.max(0, swing) * 0.6;
        const rkneeRot = Math.max(0, -swing) * 0.6;
        (c.leftLeg.children[1] as THREE.Group).rotation.x = -lkneeRot;
        (c.rightLeg.children[1] as THREE.Group).rotation.x = -rkneeRot;
        // Left arm sways slightly opposite to right leg (right arm holds rifle steady)
        c.leftArm.rotation.x = -0.5 + (-swing * armSwingScale);
        // Torso stays stable — no bob (realistic physics: upper body stabilises while walking)
        c.torso.position.y = 1.05;

        // Crouch leg pose: bend hips & knees
        if (e.crouch) {
          c.leftLeg.rotation.x += 0.6;
          c.rightLeg.rotation.x += 0.6;
          (c.leftLeg.children[1] as THREE.Group).rotation.x = -1.2;
          (c.rightLeg.children[1] as THREE.Group).rotation.x = -1.2;
        }

        // HP fill
        const ratio = Math.max(0, e.hp / e.maxHp);
        c.hpFill.scale.x = ratio;
        c.hpFill.position.x = -(1 - ratio) * 0.44;
        (c.hpFill.material as THREE.MeshBasicMaterial).color.setHex(
          ratio > 0.6 ? 0x4ade80 : ratio > 0.3 ? 0xfacc15 : 0xef4444
        );
        c.hpFill.quaternion.copy(camera.quaternion);
        c.hpBg.quaternion.copy(camera.quaternion);
        const hideHp = e.id === selfId;
        c.hpFill.visible = !hideHp;
        c.hpBg.visible = !hideHp;
      }

      // Tracers — rebuild
      while (tracerGroup.children.length) tracerGroup.remove(tracerGroup.children[0]);
      for (const t of st.tracers) {
        const age = (now - t.bornAt) / 90;
        if (age > 1) continue;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(t.from.x, t.from.y, t.from.z),
          new THREE.Vector3(t.to.x, t.to.y, t.to.z),
        ]);
        const mat = tracerMat.clone();
        mat.opacity = 1 - age;
        const line = new THREE.Line(geo, mat);
        tracerGroup.add(line);
      }

      // Flashes
      while (flashGroup.children.length) flashGroup.remove(flashGroup.children[0]);
      for (const f of st.flashes) {
        const age = (now - f.bornAt) / 70;
        if (age > 1) continue;
        const sprite = new THREE.Mesh(
          new THREE.SphereGeometry(0.15 + 0.1 * (1 - age), 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 1 - age }),
        );
        // place in front of muzzle
        const fwd = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw));
        sprite.position.set(f.pos.x + fwd.x * 1.05, f.pos.y + 0.3, f.pos.z + fwd.z * 1.05);
        flashGroup.add(sprite);
      }

      // Camera — TPP rig over right shoulder
      const self = st.entities.find(e => e.id === selfId);
      if (self) {
        const pivotY = self.pos.y + PLAYER.eye;
        const yaw = self.yaw;
        const pitch = self.pitch;
        const offX = adsRef.current ? 0.35 : 0.7;
        const offY = adsRef.current ? -0.05 : 0.25;
        const offZ = adsRef.current ? -2.0 : -3.6;
        // base offset in local space (right, up, back)
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const up = new THREE.Vector3(0, 1, 0);
        const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        // pitch tilts back vector
        const pitchedBack = back.clone().applyAxisAngle(right, -pitch);
        const pitchedUp = up.clone().applyAxisAngle(right, -pitch);
        desiredCamPos.set(self.pos.x, pivotY, self.pos.z)
          .add(right.multiplyScalar(offX))
          .add(pitchedUp.multiplyScalar(offY))
          .add(pitchedBack.multiplyScalar(-offZ));

        // Collide camera with covers/walls
        const camOrigin = new THREE.Vector3(self.pos.x, pivotY, self.pos.z);
        const camDir = desiredCamPos.clone().sub(camOrigin);
        const distWanted = camDir.length();
        camDir.normalize();
        tmpRay.set(camOrigin, camDir);
        tmpRay.far = distWanted;
        const blockers: THREE.Object3D[] = [];
        scene.traverse(o => {
          if ((o as THREE.Mesh).isMesh && o !== floor && !characters.get(selfId)?.group.children.includes(o)) {
            blockers.push(o);
          }
        });
        const hits = tmpRay.intersectObjects(blockers, false);
        let dist = distWanted;
        for (const h of hits) {
          if (h.distance < dist - 0.05) { dist = Math.max(0.6, h.distance - 0.15); break; }
        }
        const final = camOrigin.clone().add(camDir.multiplyScalar(dist));
        camera.position.lerp(final, Math.min(1, dt * 14));

        // Look ahead in aim direction
        const lookDir = new THREE.Vector3(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch),
        );
        camLookAt.set(self.pos.x + lookDir.x * 6, pivotY + lookDir.y * 6, self.pos.z + lookDir.z * 6);
        camera.lookAt(camLookAt);

        // FOV
        const targetFov = adsRef.current ? 55 : 78;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
        camera.updateProjectionMatrix();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose?.());
        else mat?.dispose?.();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId]);

  return <div ref={mountRef} className="absolute inset-0 select-none" />;
}
