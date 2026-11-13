import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AnswerPane } from "../src/components/AnswerPane";
import { CitationRail } from "../src/components/CitationRail";
import { KnowledgeNotice } from "../src/pages/ConversationPage";

afterEach(() => {
  cleanup();
});

describe("conversation states", () => {
  it("distinguishes six states by their text", () => {
    render(
      <>
        <KnowledgeNotice reason="no_knowledge_bases" />
        <AnswerPane status="waiting" body="" />
        <AnswerPane status="streaming" body="部分" />
        <AnswerPane status="complete" body="全文" />
        <AnswerPane status="failed" body="已收到" />
        <CitationRail citations={[]} settled />
      </>,
    );
    for (const text of ["没有可访问的知识库", "等待", "进行中", "完成", "失败", "没有引用"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("explains a missing capability separately from an empty library", () => {
    render(<KnowledgeNotice reason="missing_capability" />);
    expect(screen.getByText("当前密钥缺少所需能力")).toBeTruthy();
    expect(screen.queryByText("没有可访问的知识库")).toBeNull();
  });
});
