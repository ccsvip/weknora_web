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
    <div className="flex min-h-screen bg-white text-ink">
      <aside className="hidden w-[260px] shrink-0 flex-col bg-[#f9f9f9] p-3 md:flex" aria-label="主导航">
        <Link to="/" className="mb-3 flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-ink no-underline hover:bg-black/5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">W</span>
          WeKnora
        </Link>
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink no-underline hover:bg-black/5" aria-current="page">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5v-14Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 18.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
          知识库对话
        </Link>
        <Link to="/activity" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted no-underline hover:bg-black/5 hover:text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13h4l3-8 4 14 3-6h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          活动记录
        </Link>
        <div className="mt-auto border-t border-black/10 pt-3">
          <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted hover:bg-black/5 hover:text-ink" onClick={() => {
            void deleteAccessSession().finally(() => {
              void navigate({ to: "/login" });
            });
          }}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e5e5e5] font-semibold text-ink">用</span>
            退出登录
          </button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 md:px-6">
          <div className="flex items-center gap-2 text-sm font-medium"><span className="md:hidden">WeKnora</span><span className="hidden text-muted md:inline">知识库对话</span><span aria-hidden="true" className="text-muted">⌄</span></div>
          <h1 className="sr-only">WeKnora 网页对话台</h1>
          <Link to="/activity" className="rounded-lg px-3 py-2 text-sm text-muted no-underline hover:bg-[#f5f5f5] hover:text-ink md:hidden">活动</Link>
        </header>
        <main className="flex min-h-0 flex-1 flex-col"><Outlet /></main>
      </div>
    </div>
  );
}
