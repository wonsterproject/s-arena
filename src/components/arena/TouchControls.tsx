import { useEffect, useRef, useState } from "react";

export type TouchControlState = {
  moveX: number;
  moveZ: number;
  lookDX: number;   // delta yaw this frame (radians)
  lookDY: number;   // delta pitch this frame (radians)
  fire: boolean;
  ads: boolean;
  jump: boolean;
  reload: boolean;
  sprint: boolean;
  crouch: boolean;
};

interface Props {
  onConsume: () => void;       // call after each frame to clear deltas
  state: React.MutableRefObject<TouchControlState>;
  onReload: () => void;
}

/** Mobile-first touch HUD: left joystick, right look pad, fire/ADS/jump/reload buttons + gyro toggle. */
export function TouchControls({ state, onReload }: Props) {
  const [gyroOn, setGyroOn] = useState(false);
  const [gyroAvailable, setGyroAvailable] = useState(true);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);

  const stickTouch = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const lookTouch = useRef<{ id: number; lastX: number; lastY: number } | null>(null);

  useEffect(() => {
    const stickEl = stickRef.current!;
    const knobEl = knobRef.current!;
    const lookEl = lookRef.current!;
    const radius = 60;

    const onStickStart = (ev: PointerEvent) => {
      ev.preventDefault();
      const r = stickEl.getBoundingClientRect();
      stickTouch.current = { id: ev.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      stickEl.setPointerCapture(ev.pointerId);
      onStickMove(ev);
    };
    const onStickMove = (ev: PointerEvent) => {
      if (!stickTouch.current || stickTouch.current.id !== ev.pointerId) return;
      const dx = ev.clientX - stickTouch.current.cx;
      const dy = ev.clientY - stickTouch.current.cy;
      const len = Math.hypot(dx, dy);
      const cl = Math.min(len, radius);
      const nx = len ? (dx / len) * cl : 0;
      const ny = len ? (dy / len) * cl : 0;
      knobEl.style.transform = `translate(${nx}px, ${ny}px)`;
      // joystick right (+nx) = strafe right; joystick up (-ny) = forward
      state.current.moveX = nx / radius;
      state.current.moveZ = -ny / radius;
      state.current.sprint = len > radius * 0.85;
    };
    const onStickEnd = (ev: PointerEvent) => {
      if (!stickTouch.current || stickTouch.current.id !== ev.pointerId) return;
      stickTouch.current = null;
      knobEl.style.transform = `translate(0px, 0px)`;
      state.current.moveX = 0;
      state.current.moveZ = 0;
      state.current.sprint = false;
    };

    stickEl.addEventListener("pointerdown", onStickStart);
    stickEl.addEventListener("pointermove", onStickMove);
    stickEl.addEventListener("pointerup", onStickEnd);
    stickEl.addEventListener("pointercancel", onStickEnd);

    const onLookStart = (ev: PointerEvent) => {
      ev.preventDefault();
      lookTouch.current = { id: ev.pointerId, lastX: ev.clientX, lastY: ev.clientY };
      lookEl.setPointerCapture(ev.pointerId);
    };
    const onLookMove = (ev: PointerEvent) => {
      if (!lookTouch.current || lookTouch.current.id !== ev.pointerId) return;
      const dx = ev.clientX - lookTouch.current.lastX;
      const dy = ev.clientY - lookTouch.current.lastY;
      lookTouch.current.lastX = ev.clientX;
      lookTouch.current.lastY = ev.clientY;
      const sens = 0.012;
      // Drag right → camera pans right → yaw decreases
      state.current.lookDX -= dx * sens;
      // Drag down → look down → pitch decreases
      state.current.lookDY -= dy * sens;
    };
    const onLookEnd = (ev: PointerEvent) => {
      if (!lookTouch.current || lookTouch.current.id !== ev.pointerId) return;
      lookTouch.current = null;
    };
    lookEl.addEventListener("pointerdown", onLookStart);
    lookEl.addEventListener("pointermove", onLookMove);
    lookEl.addEventListener("pointerup", onLookEnd);
    lookEl.addEventListener("pointercancel", onLookEnd);

    return () => {
      stickEl.removeEventListener("pointerdown", onStickStart);
      stickEl.removeEventListener("pointermove", onStickMove);
      stickEl.removeEventListener("pointerup", onStickEnd);
      stickEl.removeEventListener("pointercancel", onStickEnd);
      lookEl.removeEventListener("pointerdown", onLookStart);
      lookEl.removeEventListener("pointermove", onLookMove);
      lookEl.removeEventListener("pointerup", onLookEnd);
      lookEl.removeEventListener("pointercancel", onLookEnd);
    };
  }, [state]);

  // Gyro: use deviceorientation (alpha=yaw, beta=pitch)
  useEffect(() => {
    if (!gyroOn) return;
    let lastAlpha: number | null = null;
    let lastBeta: number | null = null;
    const handler = (ev: DeviceOrientationEvent) => {
      if (ev.alpha == null || ev.beta == null) return;
      // alpha 0..360 (compass yaw), beta -180..180 (front-back tilt)
      const a = (ev.alpha * Math.PI) / 180;
      const b = (ev.beta * Math.PI) / 180;
      if (lastAlpha == null) { lastAlpha = a; lastBeta = b; return; }
      let dA = a - lastAlpha;
      // wrap
      if (dA >  Math.PI) dA -= Math.PI * 2;
      if (dA < -Math.PI) dA += Math.PI * 2;
      const dB = b - (lastBeta ?? b);
      lastAlpha = a; lastBeta = b;
      // sensitivity multiplier
      state.current.lookDX += dA * 2.2;
      state.current.lookDY += dB * 1.4;
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, [gyroOn, state]);

  const enableGyro = async () => {
    try {
      // iOS 13+ requires explicit permission
      const anyDOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (anyDOE?.requestPermission) {
        const res = await anyDOE.requestPermission();
        if (res !== "granted") { setGyroAvailable(false); return; }
      }
      setGyroOn(true);
    } catch {
      setGyroAvailable(false);
    }
  };

  const setBtn = (key: keyof TouchControlState, v: boolean) => {
    (state.current[key] as boolean) = v;
  };

  return (
    <>
      {/* Right-half look pad (transparent) */}
      <div
        ref={lookRef}
        className="absolute top-0 right-0 w-1/2 h-full touch-none"
        style={{ touchAction: "none" }}
      />

      {/* Left joystick — 70% transparent */}
      <div className="absolute bottom-6 left-6 z-20 touch-none">
        <div
          ref={stickRef}
          className="relative w-36 h-36 rounded-full border border-white/20 backdrop-blur-sm"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        >
          <div
            ref={knobRef}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/40 shadow-lg pointer-events-none"
            style={{ backgroundColor: "rgba(34,211,238,0.55)" }}
          />
        </div>
      </div>

      {/* Top-left gyro toggle */}
      {gyroAvailable && (
        <button
          onClick={(e) => { e.stopPropagation(); gyroOn ? setGyroOn(false) : enableGyro(); }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 h-8 rounded-full text-[11px] font-bold text-white border border-white/20 backdrop-blur"
          style={{ backgroundColor: gyroOn ? "rgba(34,211,238,0.55)" : "rgba(0,0,0,0.3)" }}
        >
          GYRO {gyroOn ? "ON" : "OFF"}
        </button>
      )}

      {/* Right action buttons — 70% transparent */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-3 touch-none">
        <div className="flex items-end gap-3">
          <button
            onPointerDown={(e) => { e.preventDefault(); state.current.crouch = !state.current.crouch; }}
            className="w-14 h-14 rounded-full border border-white/20 text-white text-xs font-bold backdrop-blur"
            style={{ backgroundColor: state.current.crouch ? "rgba(34,211,238,0.45)" : "rgba(0,0,0,0.3)" }}
          >CROUCH</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); onReload(); }}
            className="w-14 h-14 rounded-full border border-white/20 text-white text-xs font-bold backdrop-blur"
            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          >RELOAD</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); setBtn("jump", true); setTimeout(() => setBtn("jump", false), 100); }}
            className="w-14 h-14 rounded-full border border-white/20 text-white text-xs font-bold backdrop-blur"
            style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          >JUMP</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); setBtn("ads", true); }}
            onPointerUp={(e) => { e.preventDefault(); setBtn("ads", false); }}
            onPointerCancel={() => setBtn("ads", false)}
            onPointerLeave={() => setBtn("ads", false)}
            className="w-16 h-16 rounded-full border border-white/20 text-white text-[11px] font-bold backdrop-blur"
            style={{ backgroundColor: "rgba(0,0,0,0.33)" }}
          >ADS</button>
        </div>
        {/* FIRE — bullet icon, 70% transparent */}
        <button
          onPointerDown={(e) => { e.preventDefault(); setBtn("fire", true); }}
          onPointerUp={(e) => { e.preventDefault(); setBtn("fire", false); }}
          onPointerCancel={() => setBtn("fire", false)}
          onPointerLeave={() => setBtn("fire", false)}
          className="w-24 h-24 rounded-full border-2 border-white/40 backdrop-blur shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
          style={{ backgroundColor: "rgba(239,68,68,0.3)" }}
          aria-label="Fire"
        >
          <BulletIcon />
        </button>
      </div>
    </>
  );
}

function BulletIcon() {
  // Stylized bullet (cartridge) pointing up
  return (
    <svg viewBox="0 0 48 64" width="44" height="58" aria-hidden="true">
      {/* tip */}
      <path d="M24 2 L36 22 L12 22 Z" fill="#f5d36b" stroke="#fff" strokeWidth="1.5" />
      {/* casing */}
      <rect x="12" y="22" width="24" height="32" rx="2" fill="#c08a3a" stroke="#fff" strokeWidth="1.5" />
      {/* rim */}
      <rect x="10" y="54" width="28" height="6" rx="1.5" fill="#8a5e22" stroke="#fff" strokeWidth="1.5" />
      {/* highlight */}
      <rect x="16" y="26" width="4" height="22" rx="1" fill="#ffe9a8" opacity="0.85" />
    </svg>
  );
}
