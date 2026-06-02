import React from 'react';
import { AlertCircle, Search } from 'lucide-react';

export default function AdminRecordsSection({
  recordTabs,
  activeTab,
  onTabChange,
  tabCounts,
  searchQuery,
  onSearchChange,
  recordError,
  children,
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">기록 관리</h2>
          <p className="mt-1 text-sm text-slate-400">검색어를 입력해 방문, 댓글, 소감을 빠르게 확인합니다.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="방문자, 작품, 댓글, 소감 검색"
            className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-1 md:grid-cols-4">
        {recordTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={[
                'flex min-h-10 items-center justify-center gap-2 rounded-md px-2 text-sm transition',
                isActive ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-slate-100',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <span className={isActive ? 'text-slate-600' : 'text-slate-500'}>{tabCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      {recordError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {recordError}
        </div>
      )}

      {children}
    </section>
  );
}
