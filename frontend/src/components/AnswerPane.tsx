import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const frame =
    status === "waiting"
      ? "border-transparent text-muted"
      : status === "streaming"
        ? "border-l-[3px] border-accent pl-3"
        : status === "failed"
        ? "rounded-2xl bg-[#fef2f2] p-4 text-danger"
        : "text-ink";

  return (
    <article className={frame} data-state={status}>
      <p className="sr-only">{LABELS[status]}</p>
      {status === "waiting" && body === "" ? (
        <span className="inline-flex h-6 items-center gap-1" aria-hidden="true">
          <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current delay-150" />
          <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-current delay-300" />
        </span>
      ) : null}
      {body ? (
        <div
          className={`answer-md text-base leading-7 text-ink ${status === "streaming" ? "after:ml-0.5 after:inline-block after:h-[1.05em] after:w-1.5 after:animate-pulse after:bg-current after:align-text-bottom after:content-['']" : ""}`}
        >
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </div>
      ) : null}
      {status === "failed" ? <p className="mt-2 text-sm text-danger">这次没有完成</p> : null}
    </article>
  );
}
