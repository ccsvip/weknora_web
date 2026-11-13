import { useState, type FormEvent } from "react";

import { ApiError, createAccessSession } from "../services/api";

interface LoginPageProps {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createAccessSession(password);
      onSuccess();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "访问口令不正确");
    }
  }

  return (
    <main className="login">
      <form onSubmit={(event) => void submit(event)}>
        <h1>网页对话台</h1>
        <p className="meta">用访问口令进入这一次部署。</p>
        <label className="field">
          访问口令
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">进入</button>
      </form>
    </main>
  );
}
