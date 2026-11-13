import type { FormEvent } from "react";

interface ComposerProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function Composer({ value, disabled, onChange, onSubmit }: ComposerProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!disabled && value.trim()) {
      onSubmit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        value={value}
        disabled={disabled}
        rows={3}
        placeholder="向这个知识库提问"
        aria-label="问题"
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="submit" disabled={disabled || value.trim() === ""}>
        发送
      </button>
    </form>
  );
}
