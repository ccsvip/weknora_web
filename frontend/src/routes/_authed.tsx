import { Link, Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { deleteAccessSession, probeAccess } from "../services/api";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: async () => {
    if ((await probeAccess()) === "required") {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h1 className="m-0 text-lg tracking-wide">WeKnora 网页对话台</h1>
        <nav className="flex items-center gap-2">
          <Link to="/" className="rounded-full border border-line px-3 py-1 text-sm text-ink no-underline">
            对话
          </Link>
          <Link to="/activity" className="rounded-full border border-line px-3 py-1 text-sm text-ink no-underline">
            活动记录
          </Link>
          <button
            type="button"
            className="rounded-full border border-line bg-transparent px-3 py-1 text-sm text-ink"
            onClick={() => {
              void deleteAccessSession().finally(() => {
                void navigate({ to: "/login" });
              });
            }}
          >
            退出
          </button>
        </nav>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
