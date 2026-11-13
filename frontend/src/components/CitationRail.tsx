import type { Citation } from "../services/api";

interface CitationRailProps {
  citations: Citation[];
  settled: boolean;
}

export function CitationRail({ citations, settled }: CitationRailProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[#f0f0f0] bg-[#fcfcfc] px-5 py-6" aria-label="引用来源">
      <div className="mb-5">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-muted">资料来源</p>
        <h2 className="mb-0 mt-1 text-base font-semibold text-ink">引用</h2>
      </div>
      <div className="min-h-0 space-y-3 overflow-y-auto">
        {citations.length > 0 ? (
          citations.map((citation, index) => (
            <article className="rounded-xl border border-[#ededed] bg-white p-3.5" key={`${citation.title}-${index}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#f2f2f2] text-[11px] font-medium text-muted">{index + 1}</span>
                <h3 className="m-0 min-w-0 truncate text-sm font-medium text-ink">{citation.title}</h3>
              </div>
              <p className="m-0 text-xs leading-5 text-muted">{citation.excerpt}</p>
            </article>
          ))
        ) : settled ? (
          <p className="rounded-xl bg-[#f5f5f5] px-3 py-2.5 text-sm text-muted">没有引用</p>
        ) : (
          <p className="text-sm leading-6 text-muted">回答完成后，相关资料会显示在这里。</p>
        )}
      </div>
    </aside>
  );
}
