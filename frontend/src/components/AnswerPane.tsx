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
}

export function AnswerPane({ status, body }: AnswerPaneProps) {
  return (
    <article className={`answer state state-${status}`} data-state={status}>
      <p className="state-label">{LABELS[status]}</p>
      {body ? <p className="answer-body">{body}</p> : null}
    </article>
  );
}
