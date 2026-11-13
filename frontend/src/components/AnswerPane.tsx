import { useState } from "react";

import type { Citation } from "../services/api";

const LABELS = {
  waiting: "等待",
  streaming: "进行中",
  complete: "完成",
  failed: "失败",
} as const;

export type AnswerStatus = keyof typeof LABELS;

interface AnswerPaneProps {
  status: AnswerStatus;
  body: string;
  citations?: Citation[];
}

export function AnswerPane({ status, body, citations = [] }: AnswerPaneProps) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <article className={`chat-assistant state state-${status}`} data-state={status}>
      <span className="chat-mark" aria-hidden="true">
        知
      </span>
      <div>
        <p className="visually-hidden">{LABELS[status]}</p>
        {status === "waiting" && body === "" ? (
          <span className="chat-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {body ? <p className={status === "streaming" ? "chat-copy is-streaming" : "chat-copy"}>{body}</p> : null}
        {status === "failed" ? <p className="chat-fail">这次没有完成</p> : null}
        {citations.length > 0 ? (
          <div className="chat-chips">
            {citations.map((citation, index) => (
              <button
                key={`${citation.title}-${index}`}
                type="button"
                className={open === index ? "is-open" : ""}
                onClick={() => setOpen(open === index ? null : index)}
              >
                {citation.title}
              </button>
            ))}
          </div>
        ) : null}
        {open !== null && citations[open] ? <p className="chat-excerpt">{citations[open].excerpt}</p> : null}
      </div>
    </article>
  );
}
