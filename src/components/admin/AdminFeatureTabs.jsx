import React from 'react';
import { BarChart3, Link2, MapPinned, Megaphone, Users } from 'lucide-react';

const featureTabs = [
  { id: 'records', label: '기록 관리', desc: '방문, 댓글, 소감', icon: Users },
  { id: 'map', label: '지도 핀', desc: '작품 위치 조정', icon: MapPinned },
  { id: 'announcement', label: '상단 공지', desc: '방문자 안내', icon: Megaphone },
  { id: 'links', label: '운영 링크', desc: 'QR/관리 주소', icon: Link2 },
  { id: 'coordinates', label: '핀 좌표', desc: '좌표값 확인', icon: BarChart3 },
];

export default function AdminFeatureTabs({ activeFeature, onChange }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {featureTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeFeature === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={[
                'flex min-h-[76px] items-center gap-3 rounded-md border px-3 text-left transition active:scale-[0.98]',
                isActive
                  ? 'border-cyan-300 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30'
                  : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:bg-slate-900',
              ].join(' ')}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{tab.label}</span>
                <span className={['mt-0.5 block text-xs', isActive ? 'text-slate-700' : 'text-slate-500'].join(' ')}>
                  {tab.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
