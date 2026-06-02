import React from 'react';
import { Megaphone, RefreshCw, Save } from 'lucide-react';

export default function AdminAnnouncementSection({
  draft,
  isLoading,
  isSaving,
  onChange,
  onSave,
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Megaphone className="h-5 w-5 text-amber-200" />
            상단 공지
          </h2>
          <p className="mt-1 text-sm text-slate-400">방문자 화면 상단에 안내를 노출합니다.</p>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
          <input
            type="checkbox"
            name="isActive"
            checked={draft.isActive}
            onChange={onChange}
            className="h-4 w-4 accent-cyan-400"
            disabled={isLoading || isSaving}
          />
          노출
        </label>
      </div>

      <div className="grid gap-3">
        <input
          name="title"
          value={draft.title}
          onChange={onChange}
          placeholder="공지 제목"
          className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
          disabled={isLoading || isSaving}
        />
        <textarea
          name="message"
          value={draft.message}
          onChange={onChange}
          placeholder="예: 오늘 오후 3시에 상품 부스 운영을 시작합니다."
          className="min-h-24 resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-relaxed text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
          disabled={isLoading || isSaving}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={isLoading || isSaving}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-bold text-slate-950 transition active:scale-95 disabled:opacity-40"
        >
          {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          공지 저장
        </button>
      </div>
    </section>
  );
}
