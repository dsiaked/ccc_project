import React from 'react';

export default function AdminCoordinatesSection({ pins, getSymbolLabel }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
      <h2 className="text-lg font-bold text-white">핀 좌표</h2>
      <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {pins.map(pin => (
          <div key={pin.id} className="rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-slate-200">{pin.label || getSymbolLabel(pin.id)}</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">{pin.type}</span>
            </div>
            <div className="mt-1 font-mono text-xs text-cyan-300">
              L {pin.pinLeft} / T {pin.pinTop}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
