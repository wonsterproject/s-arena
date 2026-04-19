import { useRef } from "react";

interface Props {
  power: number;          // 0..1
  setPower: (p: number) => void;
  onRelease: () => void;  // fires when finger lifts (commits shot)
  disabled?: boolean;
  /** Called continuously while user is dragging (true) and on release (false). */
  onDragChange?: (dragging: boolean) => void;
}

/**
 * Slim, transparent vertical power strip designed to live on the right edge of
 * the pool board. Drag DOWN = more power. No label, just subtle tick marks
 * + a glowing fill. Shot fires automatically when finger releases.
 */
export default function VerticalPowerStrip({
  power,
  setPower,
  onRelease,
  disabled,
  onDragChange,
}: Props) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const updateFromY = (clientY: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Top = 0 power, bottom = full power. Drag down increases power.
    const ratio = (clientY - r.top) / r.height;
    setPower(Math.max(0, Math.min(1, ratio)));
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    onDragChange?.(true);
    updateFromY(e.clientY);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromY(e.clientY);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    dragging.current = false;
    onDragChange?.(false);
    if (power > 0.05) onRelease();
    else setPower(0);
  };

  return (
    <div
      ref={barRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={`relative h-full w-7 sm:w-9 rounded-full touch-none select-none cursor-grab active:cursor-grabbing ${disabled ? "opacity-40" : ""}`}
      style={{
        background:
          "linear-gradient(180deg, hsl(232 50% 14% / 0.35), hsl(232 55% 8% / 0.55))",
        boxShadow:
          "0 0 0 1px hsl(45 100% 60% / 0.25) inset, 0 4px 14px rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* Tick marks — small dashes on both sides */}
      <div className="absolute inset-y-2 inset-x-0 flex flex-col justify-between pointer-events-none">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-1">
            <div
              className="rounded-full"
              style={{
                width: i % 3 === 0 ? 6 : 3,
                height: 2,
                background: "hsl(45 100% 65% / 0.55)",
              }}
            />
            <div
              className="rounded-full"
              style={{
                width: i % 3 === 0 ? 6 : 3,
                height: 2,
                background: "hsl(45 100% 65% / 0.55)",
              }}
            />
          </div>
        ))}
      </div>

      {/* Filled portion grows from top down */}
      <div
        className="absolute inset-x-1 top-1 rounded-full pointer-events-none transition-[height] duration-75"
        style={{
          height: `calc(${power * 100}% - 0.5rem)`,
          background:
            "linear-gradient(180deg, hsl(140 80% 50% / 0.85), hsl(60 100% 55% / 0.85), hsl(30 100% 55% / 0.9), hsl(0 90% 55% / 0.95))",
          boxShadow:
            power > 0.7
              ? "0 0 14px hsl(0 90% 55% / 0.7)"
              : "0 0 8px hsl(45 100% 55% / 0.45)",
        }}
      />

      {/* Knob */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-7 h-1.5 rounded-full bg-white pointer-events-none"
        style={{
          top: `calc(${power * 100}% - 3px)`,
          boxShadow:
            "0 0 8px rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}
