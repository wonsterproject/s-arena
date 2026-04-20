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

    // Character builder: simple capsule body + head + gun
    const characters = new Map<string, {
      group: THREE.Group;
      body: THREE.Mesh;
      head: THREE.Mesh;
      gun: THREE.Mesh;
      muzzle: THREE.Object3D;
      hpBar: THREE.Sprite;
      hpFill: THREE.Mesh;
    }>();

    function makeChar(color: number) {
      const grp = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.25 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), new THREE.MeshStandardMaterial({ color: 0xf3d8b6, roughness: 0.6 }));
      head.position.y = 1.7; head.castShadow = true;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), bodyMat);
      body.position.y = 1.0; body.castShadow = true;
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0x161b26, metalness: 0.7, roughness: 0.4 }));
      gun.position.set(0.28, 1.3, 0.55);
      gun.castShadow = true;
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.28, 1.3, 1.05);
      grp.add(head, body, gun, muzzle);

      // HP bar (canvas sprite kept simple via plane)
      const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
      hpBg.position.y = 2.15;
      const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
      hpFill.position.set(0, 2.15, 0.001);
      grp.add(hpBg, hpFill);
      // billboard via update()
      const hpBar = new THREE.Sprite(); // unused but kept for interface
      return { group: grp, body, head, gun, muzzle, hpBar, hpFill };
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

      // Update characters
      for (const e of st.entities) {
        const c = characters.get(e.id);
        if (!c) continue;
        c.group.visible = e.alive;
        c.group.position.set(e.pos.x, e.pos.y, e.pos.z);
        c.group.rotation.y = e.yaw;
        // Tilt gun by pitch (only the gun + slight head)
        c.gun.rotation.x = -e.pitch;
        c.gun.position.set(0.28, 1.3 - e.pitch * 0.05, 0.55);
        c.muzzle.position.set(0.28, 1.3 - e.pitch * 0.05, 1.05);
        c.head.rotation.x = -e.pitch * 0.5;
        // HP fill
        const ratio = Math.max(0, e.hp / e.maxHp);
        c.hpFill.scale.x = ratio;
        c.hpFill.position.x = -(1 - ratio) * 0.5;
        (c.hpFill.material as THREE.MeshBasicMaterial).color.setHex(
          ratio > 0.6 ? 0x4ade80 : ratio > 0.3 ? 0xfacc15 : 0xef4444
        );
        // billboard hp bar to camera
        c.hpFill.quaternion.copy(camera.quaternion);
        // hide hp on self (we have HUD)
        c.hpFill.visible = e.id !== selfId;
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
