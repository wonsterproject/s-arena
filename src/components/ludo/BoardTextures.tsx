import { useMemo } from "react";
import { PlayerColor, PLAYER_HEX } from "@/game/ludoConstants";

/**
 * Reusable SVG defs for the realistic board:
 *  - shattered gemstone for home quadrants (heavy crack network)
 *  - polished gemstone facet for path arm tiles (vivid, slight crack)
 *  - broken volcanic stone for neutral path tiles (cracks reveal lava)
 *
 * Mounted ONCE inside the board's <svg> overlay so all tiles can <use href="..."/>.
 */

interface CrackPath {
  d: string;
  width: number;
  opacity: number;
}

/** Deterministic pseudo-random crack generator for a given seed. */
function generateCracks(seed: number, count: number, size = 100): CrackPath[] {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const cracks: CrackPath[] = [];
  for (let i = 0; i < count; i++) {
    const startX = rand() * size;
    const startY = rand() * size;
    const segments = 3 + Math.floor(rand() * 4);
    let x = startX;
    let y = startY;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    for (let j = 0; j < segments; j++) {
      const angle = rand() * Math.PI * 2;
      const len = 6 + rand() * 18;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      // occasional branch
      if (rand() > 0.55) {
        const bAngle = angle + (rand() - 0.5) * 1.6;
        const bLen = 4 + rand() * 10;
        const bx = x + Math.cos(bAngle) * bLen;
        const by = y + Math.sin(bAngle) * bLen;
        d += ` M ${x.toFixed(1)} ${y.toFixed(1)} L ${bx.toFixed(1)} ${by.toFixed(1)} M ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    cracks.push({
      d,
      width: 0.4 + rand() * 1.1,
      opacity: 0.45 + rand() * 0.45,
    });
  }
  return cracks;
}

export function BoardSVGDefs() {
  const cracksByColor = useMemo(() => {
    const map: Record<PlayerColor, CrackPath[]> = {
      red: generateCracks(7, 28),
      blue: generateCracks(13, 28),
      green: generateCracks(19, 28),
      yellow: generateCracks(23, 28),
    };
    return map;
  }, []);

  const lightCracks = useMemo(() => generateCracks(101, 6), []);
  const stoneCracksA = useMemo(() => generateCracks(53, 8), []);
  const stoneCracksB = useMemo(() => generateCracks(67, 9), []);
  const stoneCracksC = useMemo(() => generateCracks(89, 10), []);

  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {/* ---------- SHATTERED GEMSTONE QUADRANTS ---------- */}
        {(["red", "blue", "green", "yellow"] as PlayerColor[]).map((p) => {
          const c = PLAYER_HEX[p];
          return (
            <symbol
              key={`shatter-${p}`}
              id={`shatter-${p}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* deep gem base */}
              <rect width="100" height="100" fill={c} />
              {/* dark vignette around edges */}
              <rect
                width="100"
                height="100"
                fill="url(#vignette-grad)"
                opacity="0.55"
              />
              {/* highlight sweep */}
              <polygon
                points="0,0 60,0 30,100 0,100"
                fill="hsl(0 0% 100%)"
                opacity="0.08"
              />
              <polygon
                points="70,0 100,0 100,40"
                fill="hsl(0 0% 100%)"
                opacity="0.12"
              />
              {/* heavy crack network */}
              <g stroke="hsl(0 0% 0%)" fill="none" strokeLinecap="round">
                {cracksByColor[p].map((cr, i) => (
                  <path
                    key={`c-${i}`}
                    d={cr.d}
                    strokeWidth={cr.width}
                    opacity={cr.opacity}
                  />
                ))}
              </g>
              {/* bright crack highlights (refraction) */}
              <g stroke="hsl(0 0% 100%)" fill="none" strokeLinecap="round">
                {cracksByColor[p].slice(0, 14).map((cr, i) => (
                  <path
                    key={`h-${i}`}
                    d={cr.d}
                    strokeWidth={cr.width * 0.4}
                    opacity={cr.opacity * 0.55}
                    transform="translate(0.4, 0.4)"
                  />
                ))}
              </g>
              {/* inner shine */}
              <ellipse
                cx="35"
                cy="28"
                rx="22"
                ry="10"
                fill="hsl(0 0% 100%)"
                opacity="0.18"
              />
            </symbol>
          );
        })}

        {/* ---------- POLISHED GEM ARM TILES (path home column) ---------- */}
        {(["red", "blue", "green", "yellow"] as PlayerColor[]).map((p) => {
          const c = PLAYER_HEX[p];
          return (
            <symbol
              key={`gem-${p}`}
              id={`gem-${p}`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* faceted gem panel */}
              <rect width="100" height="100" fill={c} opacity="0.92" />
              {/* facet diagonals */}
              <polygon points="0,0 100,0 50,50" fill="hsl(0 0% 100%)" opacity="0.18" />
              <polygon points="0,0 50,50 0,100" fill="hsl(0 0% 0%)" opacity="0.12" />
              <polygon points="100,0 100,100 50,50" fill="hsl(0 0% 0%)" opacity="0.18" />
              <polygon points="50,50 100,100 0,100" fill="hsl(0 0% 100%)" opacity="0.10" />
              {/* center sparkle */}
              <circle cx="50" cy="50" r="3" fill="hsl(0 0% 100%)" opacity="0.6" />
              {/* light cracks */}
              <g stroke="hsl(0 0% 0%)" fill="none" strokeLinecap="round" opacity="0.45">
                {lightCracks.map((cr, i) => (
                  <path key={`gc-${i}`} d={cr.d} strokeWidth={cr.width * 0.55} />
                ))}
              </g>
              {/* gold rim */}
              <rect
                x="1.5"
                y="1.5"
                width="97"
                height="97"
                fill="none"
                stroke="hsl(45 95% 60%)"
                strokeWidth="1.2"
                opacity="0.85"
              />
            </symbol>
          );
        })}

        {/* ---------- BROKEN STONE NEUTRAL TILES (3 variants) ---------- */}
        {[
          { id: "stone-a", cracks: stoneCracksA },
          { id: "stone-b", cracks: stoneCracksB },
          { id: "stone-c", cracks: stoneCracksC },
        ].map((s) => (
          <symbol
            key={s.id}
            id={s.id}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* dark volcanic stone base — lava bg shows through gaps */}
            <rect width="100" height="100" fill="hsl(20 25% 8%)" opacity="0.82" />
            {/* rough texture overlay */}
            <rect width="100" height="100" fill="url(#stone-grain)" opacity="0.5" />
            {/* chamfered edges (3D cube look) */}
            <polygon points="0,0 100,0 92,8 8,8" fill="hsl(30 40% 18%)" opacity="0.7" />
            <polygon points="0,0 8,8 8,92 0,100" fill="hsl(30 40% 14%)" opacity="0.7" />
            <polygon points="100,0 100,100 92,92 92,8" fill="hsl(0 0% 0%)" opacity="0.55" />
            <polygon points="0,100 8,92 92,92 100,100" fill="hsl(0 0% 0%)" opacity="0.7" />
            {/* lava-glow cracks (orange shows through) */}
            <g stroke="hsl(20 90% 50%)" fill="none" strokeLinecap="round" opacity="0.85">
              {s.cracks.slice(0, 4).map((cr, i) => (
                <path key={`lg-${i}`} d={cr.d} strokeWidth={cr.width * 0.9} />
              ))}
            </g>
            {/* inner dark cracks */}
            <g stroke="hsl(0 0% 0%)" fill="none" strokeLinecap="round" opacity="0.7">
              {s.cracks.map((cr, i) => (
                <path key={`sc-${i}`} d={cr.d} strokeWidth={cr.width * 0.6} />
              ))}
            </g>
            {/* small chip highlights */}
            <circle cx="22" cy="74" r="1.5" fill="hsl(30 50% 35%)" opacity="0.7" />
            <circle cx="78" cy="32" r="1.2" fill="hsl(30 50% 35%)" opacity="0.7" />
          </symbol>
        ))}

        {/* ---------- SHARED GRADIENTS ---------- */}
        <radialGradient id="vignette-grad" cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="hsl(0 0% 0%)" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(0 0% 0%)" stopOpacity="0.85" />
        </radialGradient>
        <pattern
          id="stone-grain"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <rect width="6" height="6" fill="hsl(20 20% 10%)" />
          <circle cx="1.5" cy="1.5" r="0.4" fill="hsl(30 30% 18%)" />
          <circle cx="4.2" cy="3.8" r="0.3" fill="hsl(15 30% 6%)" />
          <circle cx="2.2" cy="4.5" r="0.5" fill="hsl(30 20% 14%)" />
        </pattern>
      </defs>
    </svg>
  );
}

/** Returns one of the three stone variants based on cell coords (deterministic). */
export function stoneVariant(r: number, c: number): "stone-a" | "stone-b" | "stone-c" {
  const v = (r * 31 + c * 17) % 3;
  return v === 0 ? "stone-a" : v === 1 ? "stone-b" : "stone-c";
}
