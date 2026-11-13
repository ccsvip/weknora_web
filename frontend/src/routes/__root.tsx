import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  notFoundComponent: () => <p className="p-8 text-muted">没有这个页面</p>,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WeKnora 网页对话台" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,460;8..60,620&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  if (import.meta.env.MODE === "test") {
    return <Outlet />;
  }
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-paper font-sans text-ink">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
