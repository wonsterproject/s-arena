import { useRef } from "react";

interface Props {
  power: number; // 0..1
  setPower: (p: number) => void;
  onShoot: () => void;
  shootLabel?: string;
  disabled?: boolean;
  canShoot?: boolean;
}

/**
 * Horizontal rainbow power meter (matches reference UI).
 * Drag along bar to set power; release commits via onShoot.
 * Big glowing Shoot/Strike button on the right.
 */
export default function PowerMeter({
  power,
  setPower,
  onShoot,
  shootLabel = "Shoot",
  disabled,
  canShoot,
}: Props) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const updateFromX = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = (clientX - r.left) / r.width;
    setPower(Math.max(0, Math.min(1, ratio)));
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragging.current = true;
    updateFromX(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromX(e.clientX);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    dragging.current = false;
    // Auto-shoot on release if power > threshold AND can shoot
    if (canShoot && power > 0.05) onShoot();
  };

  return (
    <div className="flex items-stretch gap-2 sm:gap-3 w-full">
      {/* Power bar */}
      <div
        ref={barRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={`relative flex-1 h-12 sm:h-14 rounded-full overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing ${disabled ? "opacity-50" : ""}`}
        style={{
          background:
            "linear-gradient(180deg, hsl(232 50% 14%), hsl(232 55% 8%))",
          boxShadow:
            "0 0 0 2px hsl(232 50% 30%) inset, 0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        {/* Tick marks */}
        <div className="absolute inset-0 flex items-end px-2 pb-1 pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 mx-px"
              style={{
                height: i % 5 === 0 ? "8px" : "4px",
                background: "hsl(232 30% 50% / 0.4)",
              }}
            />
          ))}
        </div>

        {/* Filled rainbow portion */}
        <div
          className="absolute inset-y-1 left-1 rounded-full pointer-events-none transition-[width] duration-75"
          style={{
            width: `calc(${power * 100}% - 0.5rem)`,
            background:
              "linear-gradient(90deg, hsl(140 80% 50%), hsl(60 100% 55%), hsl(30 100% 55%), hsl(0 90% 55%))",
            boxShadow: power > 0.7 ? "0 0 18px hsl(0 90% 55% / 0.7)" : "0 0 10px hsl(45 100% 55% / 0.5)",
          }}
        />

        {/* Knob */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-8 w-1.5 rounded-full bg-white pointer-events-none"
          style={{
            left: `calc(${power * 100}% - 3px)`,
            boxShadow: "0 0 8px rgba(255,255,255,0.9), 0 2px 4px rgba(0,0,0,0.5)",
          }}
        />
      </div>

      {/* Shoot button */}
      <button
        onClick={() => canShoot && onShoot()}
        disabled={disabled || !canShoot}
        className="h-12 sm:h-14 px-5 sm:px-7 rounded-2xl font-black text-base sm:text-lg text-white tracking-wide shrink-0 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background:
            "linear-gradient(180deg, hsl(28 100% 60%), hsl(20 100% 45%))",
          boxShadow:
            "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 0 18px hsl(28 100% 55% / 0.55), 0 6px 14px rgba(0,0,0,0.5)",
        }}
      >
        {shootLabel}
      </button>
    </div>
  );
}
