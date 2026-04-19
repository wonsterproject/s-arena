import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * Full-screen molten cracked-stone background.
 * Custom GLSL shader simulates lava flowing through black volcanic stone cracks
 * with heat shimmer, slow pulse and tiny ember sparks. Sits behind the board.
 */
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uRes;

  // hash + noise utilities
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i+vec2(1.0,0.0));
    float c = hash(i+vec2(0.0,1.0));
    float d = hash(i+vec2(1.0,1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
  }
  float fbm(vec2 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<6;i++){ v += a*noise(p); p *= 2.05; a *= 0.5; }
    return v;
  }

  // voronoi crack network — distance to second-closest cell point
  vec2 voronoiCracks(vec2 p){
    vec2 n = floor(p); vec2 f = fract(p);
    float d1 = 8.0; float d2 = 8.0;
    for(int j=-1;j<=1;j++){
      for(int i=-1;i<=1;i++){
        vec2 g = vec2(float(i), float(j));
        vec2 o = vec2(hash(n+g), hash(n+g+17.3));
        o = 0.5 + 0.5*sin(uTime*0.15 + 6.2831*o);
        vec2 r = g + o - f;
        float d = dot(r,r);
        if(d < d1){ d2 = d1; d1 = d; } else if(d < d2){ d2 = d; }
      }
    }
    return vec2(sqrt(d1), sqrt(d2));
  }

  void main(){
    vec2 uv = vUv;
    // aspect-correct
    vec2 p = uv * vec2(uRes.x/uRes.y, 1.0) * 4.0;

    // slow drift with heat shimmer
    float shimmer = fbm(p*2.5 + uTime*0.25)*0.05;
    p += shimmer;

    // crack network
    vec2 vc = voronoiCracks(p*1.2);
    float crackEdge = vc.y - vc.x;          // narrow valleys = cracks
    float crack = smoothstep(0.06, 0.0, crackEdge);

    // molten lava color inside cracks (animated fbm)
    float heat = fbm(p*1.8 + vec2(0.0, uTime*0.3));
    heat += 0.4*fbm(p*4.0 - vec2(uTime*0.4, 0.0));
    heat = clamp(heat, 0.0, 1.2);

    // base black volcanic stone with subtle texture
    vec3 stone = mix(vec3(0.025,0.018,0.022), vec3(0.07,0.04,0.05), fbm(p*5.0));
    stone *= 0.55 + 0.25*noise(p*30.0);

    // lava color ramp: deep red -> orange -> bright yellow core
    vec3 lavaDeep   = vec3(0.45, 0.05, 0.02);
    vec3 lavaMid    = vec3(1.10, 0.35, 0.05);
    vec3 lavaHot    = vec3(1.60, 0.95, 0.35);
    vec3 lava = mix(lavaDeep, lavaMid, smoothstep(0.2, 0.7, heat));
    lava = mix(lava, lavaHot, smoothstep(0.75, 1.05, heat));

    // composite
    vec3 col = stone;
    col = mix(col, lava, crack * (0.6 + 0.4*heat));

    // soft glow halo around cracks
    float halo = smoothstep(0.18, 0.0, crackEdge) - crack;
    col += lava * halo * 0.55 * (0.6 + 0.4*sin(uTime*0.8 + heat*6.0));

    // global slow pulse breathing
    float pulse = 0.85 + 0.15*sin(uTime*0.5);
    col *= pulse;

    // tiny floating embers
    vec2 sp = p*3.0 + vec2(0.0, uTime*0.6);
    float spark = step(0.997, hash(floor(sp*40.0)));
    col += vec3(1.4, 0.7, 0.2) * spark * (0.5 + 0.5*sin(uTime*8.0));

    // vignette
    float vg = smoothstep(1.4, 0.4, length(uv-0.5));
    col *= 0.55 + 0.45*vg;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function LavaPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null!);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    }),
    []
  );

  useFrame((state) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    const size = state.size;
    matRef.current.uniforms.uRes.value.set(size.width, size.height);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}

/**
 * Mounts the lava background as a fixed full-screen layer.
 * Uses a CSS gradient fallback while WebGL initializes (and as fallback for no-GPU).
 */
export function LavaBackground() {
  return (
    <div className="fixed inset-0 -z-20 overflow-hidden pointer-events-none">
      {/* CSS fallback: deep volcanic gradient with crack-like lines */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, hsl(15 90% 22%), transparent 55%)," +
            "radial-gradient(ellipse at 70% 80%, hsl(8 95% 18%), transparent 55%)," +
            "linear-gradient(160deg, hsl(15 50% 5%), hsl(0 60% 4%) 60%, hsl(20 70% 6%))",
        }}
      />
      <Canvas
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 1] }}
        className="absolute inset-0"
      >
        <LavaPlane />
      </Canvas>
      {/* Subtle dark overlay so the board pops */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, hsl(0 0% 0% / 0.55) 100%)",
        }}
      />
    </div>
  );
}
