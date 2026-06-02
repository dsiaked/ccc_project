import React from 'react';
import { Copy, ExternalLink, Link2 } from 'lucide-react';

export default function AdminLinksSection({ links, baseUrl, onCopy }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/55 p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-white">
        <Link2 className="h-5 w-5 text-cyan-200" />
        운영 링크
      </h2>
      <div className="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
        {links.map(link => (
          <div key={link.path} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
            <p className="font-bold text-slate-100">{link.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{link.desc}</p>
            <code className="mt-2 block break-all rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-cyan-200">
              {baseUrl}{link.path}
            </code>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onCopy(link.path)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95"
                aria-label={`${link.label} 복사`}
              >
                <Copy className="h-4 w-4" />
              </button>
              <a
                href={link.path}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition active:scale-95"
                aria-label={`${link.label} 열기`}
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
