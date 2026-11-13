import { useEffect, useState } from "react";

import { LogoutButton } from "./components/LogoutButton";
import { ActivityPage } from "./pages/ActivityPage";
import { ConversationPage } from "./pages/ConversationPage";
import { LoginPage } from "./pages/LoginPage";
import { ApiError, deleteAccessSession, listKnowledgeBases } from "./services/api";

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [page, setPage] = useState<"chat" | "activity">("chat");

  useEffect(() => {
    void listKnowledgeBases()
      .then(() => setAuthed(true))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "access_required") {
          setAuthed(false);
          return;
        }
        setAuthed(true);
      });
  }, []);

  if (authed === null) {
    return <p className="state state-waiting">正在确认访问</p>;
  }
  if (!authed) {
    return <LoginPage onSuccess={() => setAuthed(true)} />;
  }

  if (page === "activity") {
    return (
      <div className="shell">
        <header className="topbar">
          <h1 className="brand">WeKnora 网页对话台</h1>
          <nav>
            <button type="button" className="quiet" onClick={() => setPage("chat")}>
              对话
            </button>
            <button type="button" className="quiet" onClick={() => setPage("activity")}>
              活动记录
            </button>
            <LogoutButton onLoggedOut={() => setAuthed(false)} />
          </nav>
        </header>
        <ActivityPage />
      </div>
    );
  }

  return (
    <ConversationPage
      onOpenActivity={() => setPage("activity")}
      onLogout={() => {
        void deleteAccessSession().finally(() => setAuthed(false));
      }}
    />
  );
}
