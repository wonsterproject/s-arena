import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";

/**
 * Shows an overlay on small portrait screens prompting the user to rotate
 * their phone — the pool table is much better in landscape.
 */
export default function LandscapeGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Only block on phone-sized portrait screens
      setShow(w < 720 && h > w);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center text-center px-6"
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(232 55% 12%) 0%, hsl(232 60% 5%) 80%)",
      }}
    >
      <div
        className="rounded-full p-6 mb-5"
        style={{
          background: "linear-gradient(180deg, hsl(232 50% 16%), hsl(232 55% 9%))",
          boxShadow:
            "0 0 0 2px hsl(45 100% 60% / 0.5) inset, 0 0 32px hsl(45 100% 60% / 0.25)",
        }}
      >
        <RotateCw className="h-14 w-14 text-amber-300 animate-spin-slow" style={{ animation: "spin 2.5s linear infinite" }} />
      </div>
      <h2 className="text-2xl font-black text-white mb-2">Rotate your phone</h2>
      <p className="text-indigo-200/80 text-sm max-w-xs">
        8-Ball Pool plays best in landscape mode. Please turn your device sideways to start.
      </p>
    </div>
  );
}
