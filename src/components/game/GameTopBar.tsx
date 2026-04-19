import { ArrowLeft, RotateCcw, Volume2, Settings } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onRestart: () => void;
  /** Optional rich info shown under title (e.g. "5 left • Solids"). Overrides subtitle visual. */
  infoText?: string;
  infoColor?: string;
}

/**
 * Premium ornate top bar — center "Your Turn" badge with diamond accents,
 * back/restart on the left, sound/settings buttons on the right.
 */
export default function GameTopBar({ title, subtitle, onBack, onRestart, infoText, infoColor }: Props) {
  return (
    <div className="relative flex items-center justify-between gap-2 mb-3 px-1">
      {/* Left controls */}
      <div className="flex items-center gap-2 z-10">
        <button
          onClick={onBack}
          aria-label="Back"
          className="h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-b from-indigo-900/80 to-indigo-950/90 ring-2 ring-indigo-400/30 shadow-lg hover:scale-105 active:scale-95 transition"
        >
          <ArrowLeft className="h-5 w-5 text-indigo-100" />
        </button>
        <button
          onClick={onRestart}
          aria-label="Restart"
          className="h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-b from-indigo-900/80 to-indigo-950/90 ring-2 ring-indigo-400/30 shadow-lg hover:scale-105 active:scale-95 transition"
        >
          <RotateCcw className="h-5 w-5 text-indigo-100" />
        </button>
      </div>

      {/* Center ornate badge with info on left */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 flex items-center gap-2 pointer-events-none">
        {infoText ? (
          <div
            className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-black tracking-wide text-white whitespace-nowrap"
            style={{
              background: "linear-gradient(180deg, hsl(232 50% 14%), hsl(232 55% 8%))",
              boxShadow: `0 0 0 1.5px ${infoColor || "hsl(45 100% 60% / 0.55)"} inset, 0 0 10px ${infoColor || "hsl(45 100% 60% / 0.35)"}`,
            }}
          >
            {infoText}
          </div>
        ) : null}
        <Diamond />
        <div
          className="px-6 sm:px-10 py-1.5 rounded-full text-center font-black tracking-wide text-base sm:text-lg text-white"
          style={{
            background:
              "linear-gradient(180deg, hsl(230 50% 14%), hsl(232 55% 8%))",
            boxShadow:
              "0 0 0 2px hsl(45 100% 60% / 0.45) inset, 0 0 14px hsl(45 100% 60% / 0.25), 0 4px 14px rgba(0,0,0,0.5)",
          }}
        >
          {title}
        </div>
        <Diamond />
        {/* Subtitle placeholder to keep spacing balanced on right */}
        {infoText ? <div className="w-0" /> : subtitle ? (
          <div className="text-[11px] sm:text-xs font-semibold text-indigo-200/80 tracking-wider whitespace-nowrap">
            {subtitle}
          </div>
        ) : <div className="w-0" />}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 z-10">
        <button
          aria-label="Sound"
          className="h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-b from-indigo-900/80 to-indigo-950/90 ring-2 ring-indigo-400/30 shadow-lg hover:scale-105 active:scale-95 transition"
        >
          <Volume2 className="h-5 w-5 text-indigo-100" />
        </button>
        <button
          aria-label="Settings"
          className="h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-b from-indigo-900/80 to-indigo-950/90 ring-2 ring-indigo-400/30 shadow-lg hover:scale-105 active:scale-95 transition"
        >
          <Settings className="h-5 w-5 text-indigo-100" />
        </button>
      </div>
    </div>
  );
}

function Diamond() {
  return (
    <span
      className="block w-2 h-2 rotate-45 bg-gradient-to-br from-yellow-300 to-amber-500"
      style={{ boxShadow: "0 0 8px hsl(45 100% 60% / 0.8)" }}
    />
  );
}
