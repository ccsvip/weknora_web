import type { Citation } from "../services/api";

interface CitationRailProps {
  citations: Citation[];
  settled: boolean;
}

export function CitationRail({ citations, settled }: CitationRailProps) {
  return (
    <aside className="hidden min-h-0 flex-col border-l border-line bg-white p-4 desk:flex" aria-label="引用">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">引用</h2>
      {citations.length > 0 ? (
        citations.map((citation, index) => (
          <article className="border-t border-line py-3" key={`${citation.title}-${index}`}>
            <h3 className="m-0 text-base">{citation.title}</h3>
            <p className="m-0 text-sm text-muted">{citation.excerpt}</p>
          </article>
        ))
      ) : settled ? (
        <p className="border-t border-line pt-3 text-sm italic text-muted">没有引用</p>
      ) : (
        <p className="text-sm text-muted">回答结束后会显示出处</p>
      )}
    </aside>
  );
}
