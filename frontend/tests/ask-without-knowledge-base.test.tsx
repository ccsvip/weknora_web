import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationPage } from "../src/pages/ConversationPage";
import { createConversation, listConversations, listKnowledgeBases } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  ApiError: class ApiError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  listKnowledgeBases: vi.fn(async () => ({ data: [], reason: "none" })),
  listConversations: vi.fn(async () => ({ data: [] })),
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  deleteConversation: vi.fn(),
  streamMessage: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("asking without a knowledge base", () => {
  it("keeps the question and explains that it was not sent", async () => {
    render(<ConversationPage />);
    const input = await screen.findByRole("textbox", { name: "问题" });
    fireEvent.change(input, { target: { value: "入职第一周要做什么" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("没有可提问的知识库，问题没有发出")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "问题" })).toHaveProperty("value", "入职第一周要做什么");
    expect(createConversation).not.toHaveBeenCalled();
    expect(listKnowledgeBases).toHaveBeenCalled();
    expect(listConversations).toHaveBeenCalled();
  });
});
