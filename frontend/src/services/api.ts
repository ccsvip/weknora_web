export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  accessible: boolean;
}

export interface Conversation {
  id: string;
  knowledge_base_id: string;
  knowledge_base_name: string;
  title: string;
  continuable: boolean;
  created_at: string;
  updated_at: string;
  messages?: Message[];
}

export interface Citation {
  title: string;
  excerpt: string;
  position?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  body: string;
  status: "complete" | "streaming" | "interrupted";
  created_at: string;
  citations: Citation[];
}

export interface ActivityRecord {
  id: string;
  conversation_id: string;
  conversation_title: string;
  kind: string;
  summary: string;
  created_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) {
    return undefined as T;
  }
  let payload: { error?: { code?: string; message?: string } } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== "object") {
    throw new ApiError("upstream_failed", "接口没有返回可用的数据");
  }
  if (!response.ok) {
    const error = payload.error ?? { code: "upstream_failed", message: "请求没有完成" };
    throw new ApiError(error.code ?? "upstream_failed", error.message ?? "请求没有完成");
  }
  return payload as T;
}

export function createAccessSession(password: string) {
  return request<{ data: Record<string, never> }>("/access-sessions", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function deleteAccessSession() {
  return request<void>("/access-sessions/current", { method: "DELETE" });
}

export function listKnowledgeBases() {
  return request<{ data: KnowledgeBase[]; reason: string }>("/knowledge-bases");
}

export function listConversations() {
  return request<{ data: Conversation[] }>("/conversations");
}

export function createConversation(knowledgeBaseId: string) {
  return request<{ data: Conversation }>("/conversations", {
    method: "POST",
    body: JSON.stringify({ knowledge_base_id: knowledgeBaseId }),
  });
}

export function getConversation(id: string) {
  return request<{ data: Conversation }>(`/conversations/${id}`);
}

export function deleteConversation(id: string) {
  return request<void>(`/conversations/${id}`, { method: "DELETE" });
}

export function listActivity(conversationId?: string) {
  const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
  return request<{ data: ActivityRecord[] }>(`/activity-records${query}`);
}

export async function streamMessage(
  conversationId: string,
  content: string,
  onEvent: (event: string, data: Record<string, unknown>) => void,
) {
  const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = payload.error ?? { code: "upstream_failed", message: "请求没有完成" };
    throw new ApiError(error.code ?? "upstream_failed", error.message ?? "请求没有完成");
  }
  if (!response.body) {
    throw new ApiError("upstream_failed", "没有收到回答");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
    let splitAt = buffer.indexOf("\n\n");
    while (splitAt >= 0) {
      const block = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt + 2);
      const parsed = parseEvent(block);
      if (parsed) {
        onEvent(parsed.event, parsed.data);
      }
      splitAt = buffer.indexOf("\n\n");
    }
  }
}

function parseEvent(block: string): { event: string; data: Record<string, unknown> } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { event, data: JSON.parse(dataLines.join("\n")) };
}
