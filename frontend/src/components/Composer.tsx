import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

interface ComposerProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  accessory?: ReactNode;
}

export function Composer({ value, disabled, onChange, onSubmit, accessory }: ComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const canSend = !disabled && value.trim() !== "";

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSend) {
      onSubmit();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !composing.current) {
      event.preventDefault();
      if (canSend) {
        onSubmit();
      }
    }
  }

  return (
    <form className="mx-auto mt-auto grid w-full max-w-3xl gap-2 pt-4" onSubmit={submit}>
      <div className="rounded-[1.75rem] border border-[#d9d9d9] bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] focus-within:border-[#b8b8b8]">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder="向知识库提问"
          aria-label="问题"
          className="w-full resize-none border-0 bg-transparent font-sans text-base text-ink outline-none"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {accessory}
          <button
            type="submit"
            className="grid h-8 w-8 place-items-center rounded-full bg-accent text-paper disabled:bg-line"
            disabled={!canSend}
            aria-label="发送"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 19V6M6.5 11.5 12 6l5.5 5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <p className="m-0 text-center text-xs text-muted">回答来自知识库，请核对旁侧引用。</p>
    </form>
  );
}
