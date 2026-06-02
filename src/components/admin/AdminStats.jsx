import React from 'react';

export default function AdminStats({ stats }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(item => (
        <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">{item.label}</p>
              <strong className="mt-2 block text-3xl text-white">{item.value}</strong>
            </div>
            {item.breakdown && (
              <div className="grid gap-1 text-right">
                {item.breakdown.map(detail => (
                  <span key={detail.label} className={`text-xs ${detail.tone}`}>
                    {detail.label} {detail.value}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs leading-snug text-slate-500">{item.desc}</p>
          {item.chart?.length > 0 && (
            <div className="mt-3 grid gap-2">
              {item.chart.map(row => (
                <div key={row.count} className="grid grid-cols-[34px_1fr_34px] items-center gap-2 text-[11px] text-slate-400">
                  <span>{row.count}개</span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-cyan-300"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <span className="text-right text-slate-300">{row.visitors}명</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
