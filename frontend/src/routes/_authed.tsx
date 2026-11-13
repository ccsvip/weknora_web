import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { probeAccess } from "../services/api";

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
  return (
    <div className="min-h-dvh bg-white text-ink">
      <h1 className="sr-only">WeKnora 知识库助手</h1>
      <main className="flex min-h-dvh flex-col">
        <Outlet />
      </main>
    </div>
  );
}
