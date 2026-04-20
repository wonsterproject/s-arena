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
};

interface Props {
  onConsume: () => void;       // call after each frame to clear deltas
  state: React.MutableRefObject<TouchControlState>;
  onReload: () => void;
}

/** Mobile-first touch HUD: left joystick, right look pad, fire/ADS/jump/reload buttons. */
export function TouchControls({ state, onReload }: Props) {
  const [showJump, setShowJump] = useState(true);
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
      // sensitivity
      const sens = 0.0045;
      state.current.lookDX += dx * sens;
      state.current.lookDY += dy * sens;
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

      {/* Left joystick */}
      <div className="absolute bottom-6 left-6 z-20 touch-none">
        <div ref={stickRef} className="relative w-36 h-36 rounded-full bg-black/40 border border-white/15 backdrop-blur-sm">
          <div ref={knobRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-cyan-400/70 border border-white/40 shadow-lg pointer-events-none" />
        </div>
      </div>

      {/* Right action buttons */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-3 touch-none">
        <div className="flex items-end gap-3">
          <button
            onPointerDown={(e) => { e.preventDefault(); onReload(); }}
            className="w-14 h-14 rounded-full bg-black/50 border border-white/20 text-white text-xs font-bold backdrop-blur"
          >RELOAD</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); setBtn("jump", true); setTimeout(() => setBtn("jump", false), 100); }}
            className="w-14 h-14 rounded-full bg-black/50 border border-white/20 text-white text-xs font-bold backdrop-blur"
          >JUMP</button>
          <button
            onPointerDown={(e) => { e.preventDefault(); setBtn("ads", true); }}
            onPointerUp={(e) => { e.preventDefault(); setBtn("ads", false); }}
            onPointerCancel={() => setBtn("ads", false)}
            onPointerLeave={() => setBtn("ads", false)}
            className="w-16 h-16 rounded-full bg-black/55 border border-white/20 text-white text-[11px] font-bold backdrop-blur"
          >ADS</button>
        </div>
        <button
          onPointerDown={(e) => { e.preventDefault(); setBtn("fire", true); }}
          onPointerUp={(e) => { e.preventDefault(); setBtn("fire", false); }}
          onPointerCancel={() => setBtn("fire", false)}
          onPointerLeave={() => setBtn("fire", false)}
          className="w-24 h-24 rounded-full bg-red-500/80 border-2 border-white/40 text-white text-base font-black backdrop-blur shadow-2xl active:scale-95 transition-transform"
        >FIRE</button>
      </div>
    </>
  );
}
