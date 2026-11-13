import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerPane } from "../src/components/AnswerPane";
import { routeTree } from "../src/routeTree.gen";
import { listActivity, listConversations, listKnowledgeBases, probeAccess } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  ApiError: class ApiError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  probeAccess: vi.fn(),
  listKnowledgeBases: vi.fn(),
  listConversations: vi.fn(),
  listActivity: vi.fn(),
  getConversation: vi.fn(),
  createAccessSession: vi.fn(),
  deleteAccessSession: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  streamMessage: vi.fn(),
}));

const MARKDOWN = `列表示例：

- 入职第一天
- 阅读手册

| 项目 | 状态 |
| --- | --- |
| 工牌 | 已领取 |

\`\`\`ts
const step = "welcome";
\`\`\`
`;

afterEach(() => {
  cleanup();
});

describe("markdown answers", () => {
  it("renders tables, lists and fenced code from assistant markdown", () => {
    render(<AnswerPane status="complete" body={MARKDOWN} />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("工牌")).toBeTruthy();
    expect(screen.getByRole("list")).toBeTruthy();
    expect(screen.getByText("入职第一天")).toBeTruthy();
    expect(document.querySelector("pre")).toBeTruthy();
    expect(screen.getByText('const step = "welcome";')).toBeTruthy();
  });

  it("keeps streaming answers in progress while markdown is re-rendered", () => {
    const { rerender } = render(<AnswerPane status="streaming" body="正在" />);
    expect(screen.getByText("进行中")).toBeTruthy();
    expect(screen.queryByText("完成")).toBeNull();
    expect(document.querySelector("[data-state='streaming']")).toBeTruthy();

    rerender(<AnswerPane status="streaming" body={"正在\n\n- 追加一项"} />);
    expect(screen.getByText("进行中")).toBeTruthy();
    expect(screen.queryByText("完成")).toBeNull();
    expect(document.querySelector("[data-state='streaming']")).toBeTruthy();
    expect(screen.getByRole("list")).toBeTruthy();
  });
});

describe("unauthenticated route guards", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    vi.mocked(probeAccess).mockResolvedValue("required");
    vi.mocked(listKnowledgeBases).mockResolvedValue({ data: [], reason: "none" });
    vi.mocked(listConversations).mockResolvedValue({ data: [] });
    vi.mocked(listActivity).mockResolvedValue({ data: [] });
  });

  it("opens /login when visiting / without an access session", async () => {
    const router = renderPath("/");
    expect(await screen.findByLabelText("访问口令")).toBeTruthy();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(screen.getByRole("heading", { name: "网页对话台" })).toBeTruthy();
    expect(listKnowledgeBases).not.toHaveBeenCalled();
  });

  it("opens /login when visiting /activity without an access session", async () => {
    const router = renderPath("/activity");
    expect(await screen.findByLabelText("访问口令")).toBeTruthy();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/login");
    });
    expect(screen.queryByRole("heading", { name: "活动记录" })).toBeNull();
    expect(listActivity).not.toHaveBeenCalled();
  });
});

function renderPath(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    scrollRestoration: false,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  render(<RouterProvider router={router} />);
  void router.load();
  return router;
}
