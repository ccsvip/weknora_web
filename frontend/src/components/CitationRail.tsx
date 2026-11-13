import type { Citation } from "../services/api";

interface CitationRailProps {
  citations: Citation[];
  settled: boolean;
}

export function CitationRail({ citations, settled }: CitationRailProps) {
  return (
    <aside className="rail" aria-label="引用">
      <h2>引用</h2>
      {settled && citations.length === 0 ? <p className="state state-nocite">没有引用</p> : null}
      {citations.map((citation, index) => (
        <article className="citation" key={`${citation.title}-${index}`}>
          <h3>{citation.title}</h3>
          <p>{citation.excerpt}</p>
        </article>
      ))}
    </aside>
  );
}
