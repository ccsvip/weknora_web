import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { ApiError, createAccessSession } from "../services/api";

interface LoginPageProps {
  onSuccess?: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps = {}) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createAccessSession(password);
      onSuccess?.();
      await navigate({ to: "/" });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "访问口令不正确");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-12 text-ink">
      <form
        className="w-full max-w-md rounded-3xl border border-line bg-[#fffdf8] p-8 shadow-[0_24px_60px_rgba(28,25,21,0.06)]"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="m-0 font-serif text-[2.2rem] font-normal">网页对话台</h1>
        <p className="mt-2 text-muted">用访问口令进入这一次部署。</p>
        <label className="mt-6 grid gap-2 text-sm">
          访问口令
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            className="rounded-xl border border-line bg-paper px-3 py-2 text-base text-ink"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          className="mt-6 rounded-full border border-accent bg-accent px-5 py-2 text-paper"
        >
          进入
        </button>
      </form>
    </main>
  );
}
