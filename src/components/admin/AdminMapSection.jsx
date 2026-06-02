import React from 'react';
import { MapPinned, RefreshCw, RotateCcw, Save } from 'lucide-react';
import MapArea from '../MapArea';

export default function AdminMapSection({
  isLoadingPins,
  isSaving,
  mockSymbols,
  pins,
  onPinMove,
  onReset,
  onSave,
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <MapPinned className="h-5 w-5 text-cyan-200" />
            지도 핀 위치
          </h2>
          <p className="mt-1 text-sm text-slate-400">핀을 드래그한 뒤 저장하면 방문자 화면에 반영됩니다.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={isLoadingPins}
            className="flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200 transition active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
            기본값
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || isLoadingPins}
            className="flex h-10 items-center gap-2 rounded-lg bg-cyan-500 px-3 text-sm font-bold text-slate-950 transition active:scale-95 disabled:opacity-40"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </button>
        </div>
      </div>

      {isLoadingPins ? (
        <div className="flex aspect-[345/324] items-center justify-center rounded-lg bg-slate-950/60">
          <RefreshCw className="h-7 w-7 animate-spin text-cyan-300" />
        </div>
      ) : (
        <MapArea
          symbols={mockSymbols}
          onSymbolClick={() => {}}
          isQuestionUnlocked={true}
          editable={true}
          onPinMove={onPinMove}
          pins={pins}
        />
      )}
    </section>
  );
}
