import { useEffect, useMemo, useRef } from "react";
import { ARENA, COVERS, MATCH } from "@/game/arena/constants";
import type { ArenaState } from "@/game/arena/engine";

interface Props {
  state: ArenaState;
  selfId: string;
  ads: boolean;
  spread: number;
  hitMarkerAt: number;
  damageDirAngle: number | null;
}

export function ArenaHUD({ state, selfId, ads, spread, hitMarkerAt, damageDirAngle }: Props) {
  const self = state.entities.find(e => e.id === selfId)!;
  const opp = state.entities.find(e => e.id !== selfId)!;

  // Crosshair gap scales with spread (rad → px)
  const gap = Math.min(40, Math.max(4, spread * 600));

  const remainingMs = Math.max(0, state.endsAt - performance.now());
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000).toString().padStart(2, "0");

  const hpPct = Math.max(0, (self.hp / self.maxHp) * 100);

  const showHit = performance.now() - hitMarkerAt < 180;

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* Top center: timer + score */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/55 backdrop-blur px-4 py-2 rounded-full border border-white/15">
        <div className="flex items-center gap-2 text-cyan-300 font-black text-lg leading-none">
          <span>{self.kills}</span>
        </div>
        <div className="text-white/70 text-xs">VS</div>
        <div className="flex items-center gap-2 text-orange-300 font-black text-lg leading-none">
          <span>{opp.kills}</span>
        </div>
        <div className="w-px h-5 bg-white/20 mx-1" />
        <div className="font-mono font-bold text-white tabular-nums">{mm}:{ss}</div>
      </div>

      {/* Top-left: minimap */}
      <Minimap state={state} selfId={selfId} />

      {/* Top-right: kill feed */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 max-w-[60vw] sm:max-w-[280px]">
        {state.killFeed.slice(-3).map(k => {
          const age = performance.now() - k.at;
          const opacity = age < 3000 ? 1 : Math.max(0, 1 - (age - 3000) / 1500);
          return (
            <div key={k.id} style={{ opacity }} className="bg-black/55 backdrop-blur px-2.5 py-1 rounded-md text-xs font-semibold border border-white/10 flex items-center gap-1.5">
              <span className="text-cyan-300">{k.shooter}</span>
              <span className="text-white/70">→</span>
              {k.headshot && <span className="text-rose-400 text-[10px] font-black">HS</span>}
              <span className="text-orange-300">{k.victim}</span>
            </div>
          );
        })}
      </div>

      {/* Crosshair */}
      <Crosshair gap={gap} ads={ads} hit={showHit} />

      {/* Damage indicator */}
      {damageDirAngle !== null && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div
            className="absolute"
            style={{
              transform: `rotate(${damageDirAngle}rad) translateY(-110px)`,
              transformOrigin: "center",
            }}
          >
            <div className="w-12 h-2 bg-red-500/90 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
          </div>
        </div>
      )}

      {/* Bottom-center: HP + ammo */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(560px,90vw)]">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="text-[10px] uppercase tracking-widest text-white/70 font-bold">Health</div>
          <div className="font-mono font-black text-white tabular-nums">
            <span className="text-2xl">{self.ammo}</span>
            <span className="text-white/60"> / {self.reserve}</span>
          </div>
        </div>
        <div className="h-3 rounded-full bg-black/55 border border-white/15 overflow-hidden">
          <div
            className="h-full transition-[width] duration-150"
            style={{
              width: `${hpPct}%`,
              background: hpPct > 60 ? "linear-gradient(90deg,#22c55e,#84cc16)" :
                          hpPct > 30 ? "linear-gradient(90deg,#facc15,#f97316)" :
                                       "linear-gradient(90deg,#ef4444,#b91c1c)",
            }}
          />
        </div>
        {self.reloading && (
          <div className="text-center text-[11px] text-yellow-300 font-bold mt-1 animate-pulse">RELOADING…</div>
        )}
      </div>

      {/* Death overlay */}
      {!self.alive && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-rose-400 text-4xl font-black mb-2">ELIMINATED</div>
            <div className="text-white/80 text-sm">Respawning in {Math.max(0, Math.ceil((self.respawnAt - performance.now()) / 1000))}s</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Crosshair({ gap, ads, hit }: { gap: number; ads: boolean; hit: boolean }) {
  if (ads) {
    return (
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={`w-1 h-1 rounded-full ${hit ? "bg-rose-400" : "bg-white"}`} />
      </div>
    );
  }
  const color = hit ? "bg-rose-400" : "bg-white";
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20">
      {/* center dot */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full ${color}`} />
      {/* 4 arms */}
      <div className={`absolute left-1/2 -translate-x-1/2 ${color}`} style={{ top: `calc(50% - ${gap + 10}px)`, width: 2, height: 8 }} />
      <div className={`absolute left-1/2 -translate-x-1/2 ${color}`} style={{ top: `calc(50% + ${gap + 2}px)`, width: 2, height: 8 }} />
      <div className={`absolute top-1/2 -translate-y-1/2 ${color}`} style={{ left: `calc(50% - ${gap + 10}px)`, height: 2, width: 8 }} />
      <div className={`absolute top-1/2 -translate-y-1/2 ${color}`} style={{ left: `calc(50% + ${gap + 2}px)`, height: 2, width: 8 }} />
      {hit && <div className="absolute inset-0 border-2 border-rose-400/80 rounded-full animate-ping" />}
    </div>
  );
}

function Minimap({ state, selfId }: { state: ArenaState; selfId: string }) {
  const size = 130;
  const scale = size / (ARENA.size * 2);
  const cx = size / 2;
  const cz = size / 2;
  const self = state.entities.find(e => e.id === selfId)!;

  return (
    <div className="absolute top-3 left-3 rounded-2xl bg-black/55 backdrop-blur border border-white/15 p-1.5">
      <svg width={size} height={size} className="block">
        {/* arena bg */}
        <rect x={0} y={0} width={size} height={size} rx={10} fill="#0b1226" />
        {/* covers */}
        {COVERS.map((c, i) => (
          <rect
            key={i}
            x={cx + c.x * scale - (c.w * scale) / 2}
            y={cz + c.z * scale - (c.d * scale) / 2}
            width={c.w * scale}
            height={c.d * scale}
            fill="#475569"
            rx={1}
          />
        ))}
        {/* entities */}
        {state.entities.map(e => {
          const isSelf = e.id === selfId;
          const x = cx + e.pos.x * scale;
          const y = cz + e.pos.z * scale;
          if (!e.alive) return null;
          // show enemy only if facing roughly toward you (simple "intel" rule) — for v1 always show
          return (
            <g key={e.id} transform={`translate(${x},${y})`}>
              {isSelf && (
                <polygon
                  points="0,-7 5,5 -5,5"
                  fill={e.color}
                  transform={`rotate(${(e.yaw * 180) / Math.PI})`}
                />
              )}
              {!isSelf && <circle r={4} fill={e.color} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
