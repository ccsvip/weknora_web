import type { Citation } from "../services/api";

interface CitationRailProps {
  citations: Citation[];
  settled: boolean;
}

export function CitationRail({ citations, settled }: CitationRailProps) {
  if (citations.length === 0) {
    return settled ? <p className="chat-nocite">没有引用</p> : null;
  }

  return (
    <div className="chat-cite-list">
      {citations.map((citation, index) => (
        <article className="citation" key={`${citation.title}-${index}`}>
          <h3>{citation.title}</h3>
          <p>{citation.excerpt}</p>
        </article>
      ))}
    </div>
  );
}
