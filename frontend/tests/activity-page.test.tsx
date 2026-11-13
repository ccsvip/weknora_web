import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityPage } from "../src/pages/ActivityPage";
import { listActivity, type ActivityRecord } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  listActivity: vi.fn(),
}));

const rows: ActivityRecord[] = [
  {
    id: "1",
    conversation_id: "c1",
    conversation_title: "甲",
    kind: "conversation_deleted",
    summary: "已删除对话",
    created_at: "2026-11-13T00:00:00Z",
  },
  {
    id: "2",
    conversation_id: "c2",
    conversation_title: "乙",
    kind: "message_completed",
    summary: "回答已完成",
    created_at: "2026-11-13T00:00:01Z",
  },
];

describe("activity page", () => {
  beforeEach(() => {
    vi.mocked(listActivity).mockImplementation(async (conversationId?: string) => {
      const data = conversationId ? rows.filter((row) => row.conversation_id === conversationId) : rows;
      return { data };
    });
  });

  it("filters by conversation and hides message bodies on delete events", async () => {
    render(<ActivityPage />);
    expect(await screen.findByText("已删除对话")).toBeTruthy();
    expect(screen.getByText("回答已完成")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("按对话筛选"), { target: { value: "c1" } });
    expect(await screen.findByText("已删除对话")).toBeTruthy();
    expect(screen.queryByText("回答已完成")).toBeNull();
    expect(screen.queryByText("机密正文不应出现")).toBeNull();
  });
});
