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
    <form className="mx-auto mt-auto grid w-full max-w-3xl shrink-0 gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 desk:px-0" onSubmit={submit}>
      <div className="rounded-[1.65rem] border border-[#e5e5e5] bg-white px-5 py-3.5 shadow-[0_3px_14px_rgba(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_4px_18px_rgba(0,0,0,0.09)]">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={disabled ? "知识库暂不可用" : "向知识库提问"}
          aria-label="问题"
          className="w-full resize-none border-0 bg-transparent font-sans text-base leading-7 text-ink outline-none placeholder:text-[#999] disabled:cursor-not-allowed"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
        />
        <div className="mt-2 flex min-h-9 items-center justify-between gap-3">
          {accessory}
          <button
            type="submit"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#202020] text-white transition-colors hover:bg-black disabled:bg-[#e8e8e8] disabled:text-[#a1a1a1]"
            disabled={!canSend}
            aria-label="发送"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <p className="m-0 text-center text-[11px] leading-5 text-[#969696]">回答会优先依据知识库内容，并附上资料来源</p>
    </form>
  );
}
