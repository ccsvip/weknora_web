import { useEffect, useRef, useState } from "react";

import { AnswerPane, type AnswerStatus } from "../components/AnswerPane";
import { CitationRail } from "../components/CitationRail";
import { Composer } from "../components/Composer";
import { ConversationList } from "../components/ConversationList";
import {
  ApiError,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listKnowledgeBases,
  streamMessage,
  type Citation,
  type Conversation,
  type KnowledgeBase,
} from "../services/api";

interface ConversationPageProps {
  initialKnowledge?: { data: KnowledgeBase[]; reason?: string };
  initialConversations?: Conversation[];
  initialSelected?: Conversation | null;
  selectedId?: string | null;
  onSelectConversation?: (id: string | null) => void;
}

export function KnowledgeNotice({ reason }: { reason: string }) {
  if (reason === "no_knowledge_bases") {
    return <p className="rounded-xl bg-[#f3f3f3] px-3 py-2 text-sm">没有可访问的知识库</p>;
  }
  if (reason === "missing_capability") {
    return <p className="rounded-xl bg-[#f3f3f3] px-3 py-2 text-sm">当前密钥缺少所需能力</p>;
  }
  if (reason === "upstream_forbidden") {
    return <p className="rounded-xl bg-[#f3f3f3] px-3 py-2 text-sm">上游拒绝列出知识库</p>;
  }
  if (reason === "upstream_unreachable") {
    return <p className="rounded-xl bg-[#f3f3f3] px-3 py-2 text-sm">暂时连不上知识库</p>;
  }
  return null;
}

export function ConversationPage({
  initialKnowledge,
  initialConversations,
  initialSelected,
  selectedId: selectedIdFromSearch,
  onSelectConversation,
}: ConversationPageProps = {}) {
  const [reason, setReason] = useState(initialKnowledge?.reason ?? "none");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>(initialKnowledge?.data ?? []);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState(initialKnowledge?.data?.[0]?.id ?? "");
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    selectedIdFromSearch ?? initialSelected?.id ?? null,
  );
  const [detail, setDetail] = useState<Conversation | null>(initialSelected ?? null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<AnswerStatus | "idle">("idle");
  const [liveBody, setLiveBody] = useState("");
  const [liveCitations, setLiveCitations] = useState<Citation[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  async function refreshList() {
    const payload = await listConversations();
    setConversations(payload.data ?? []);
  }

  useEffect(() => {
    if (initialKnowledge) {
      return;
    }
    void listKnowledgeBases()
      .then((payload) => {
        const rows = payload.data ?? [];
        setReason(payload.reason ?? (rows.length === 0 ? "no_knowledge_bases" : "none"));
        setKnowledgeBases(rows);
        setKnowledgeBaseId(rows[0]?.id ?? "");
      })
      .catch(() => {
        setReason("upstream_unreachable");
      });
  }, [initialKnowledge]);

  useEffect(() => {
    if (initialConversations) {
      return;
    }
    void refreshList().catch(() => {
      setNotice("暂时连不上对话列表");
    });
  }, [initialConversations]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    if (initialSelected && initialSelected.id === selectedId) {
      setDetail(initialSelected);
      return;
    }
    void getConversation(selectedId).then((payload) => setDetail(payload.data ?? null));
  }, [selectedId, initialSelected]);

  const askingDisabled =
    reason === "no_knowledge_bases" ||
    reason === "missing_capability" ||
    reason === "upstream_forbidden" ||
    reason === "upstream_unreachable" ||
    phase === "waiting" ||
    phase === "streaming" ||
    (detail !== null && detail.continuable === false);

  const settled = phase === "complete" || phase === "failed" || lastAssistantSettled(detail, phase);
  const railCitations =
    phase === "waiting" || phase === "streaming" || phase === "complete" || phase === "failed"
      ? liveCitations
      : lastCitations(detail);
  const messages = detail?.messages ?? [];

  useEffect(() => {
    const element = threadRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages.length, pendingQuestion, liveBody, phase]);

  function resetLive() {
    setPhase("idle");
    setLiveBody("");
    setLiveCitations([]);
    setPendingQuestion("");
    setNotice("");
  }

  function chooseConversation(id: string | null) {
    setSelectedId(id);
    resetLive();
    onSelectConversation?.(id);
  }

  async function submit() {
    const content = draft;
    setNotice("");
    setDraft("");
    setPendingQuestion(content);
    setLiveBody("");
    setLiveCitations([]);
    setPhase("waiting");
    try {
      let conversationId = selectedId;
      if (!conversationId) {
        if (!knowledgeBaseId) {
          setPhase("idle");
          setPendingQuestion("");
          setDraft(content);
          setNotice("没有可提问的知识库，问题没有发出");
          return;
        }
        const created = await createConversation(knowledgeBaseId);
        if (!created.data?.id) {
          throw new ApiError("upstream_failed", "没有创建出对话");
        }
        conversationId = created.data.id;
        setSelectedId(conversationId);
        onSelectConversation?.(conversationId);
      }
      let outcome: AnswerStatus = "waiting";
      let streamedCitations: Citation[] = [];
      await streamMessage(conversationId, content, (event, data) => {
        if (event === "message") {
          outcome = "streaming";
          setPhase("streaming");
          setLiveBody((current) => current + String(data.delta ?? ""));
        } else if (event === "references") {
          streamedCitations = Array.isArray(data.citations) ? (data.citations as Citation[]) : [];
          setLiveCitations(streamedCitations);
        } else if (event === "error") {
          outcome = "failed";
          setPhase("failed");
          setNotice(String(data.message ?? "回答失败"));
        } else if (event === "done") {
          outcome = data.status === "complete" ? "complete" : "failed";
          setPhase(outcome);
        }
      });
      let refreshed = await getConversation(conversationId);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const assistant = [...(refreshed.data?.messages ?? [])]
          .reverse()
          .find((message) => message.role === "assistant");
        if (!assistant || assistant.status !== "streaming") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
        refreshed = await getConversation(conversationId);
      }
      setDetail(applyStreamOutcome(refreshed.data ?? null, outcome, streamedCitations));
      setPendingQuestion("");
      setPhase("idle");
      setLiveBody("");
      setLiveCitations([]);
      await refreshList();
    } catch (caught) {
      setPhase("failed");
      setPendingQuestion("");
      setDraft(content);
      setNotice(caught instanceof ApiError ? caught.message : "回答失败");
    }
  }

  const knowledgeName =
    detail?.knowledge_base_name ||
    knowledgeBases.find((item) => item.id === knowledgeBaseId)?.name ||
    "知识库";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 desk:grid-cols-[15rem_minmax(0,1fr)_17rem] desk:items-stretch">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => chooseConversation(id)}
        onCreate={() => {
          setDetail(null);
          chooseConversation(null);
        }}
        onDelete={(id) => {
          void deleteConversation(id)
            .then(() => {
              if (selectedId === id) {
                setDetail(null);
                chooseConversation(null);
              }
              return refreshList();
            })
            .catch((caught: unknown) => {
              setNotice(caught instanceof ApiError ? caught.message : "删除没有完成，对话仍保留");
            });
        }}
      />
      <section
        className="flex min-h-[28rem] min-w-0 flex-col bg-white px-4 pb-4 pt-3 desk:min-h-[calc(100vh-3.5rem)] desk:px-8"
        aria-label="当前对话"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted">对话</h2>
          {knowledgeBases.length > 0 && !detail ? (
            <select
              className="rounded-full border-0 bg-[#f3f3f3] px-3 py-1 text-sm text-ink"
              aria-label="知识库"
              value={knowledgeBaseId}
              onChange={(event) => setKnowledgeBaseId(event.target.value)}
            >
              {knowledgeBases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded-full bg-[#f3f3f3] px-3 py-1 text-sm">{knowledgeName}</span>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-7 overflow-auto py-6" ref={threadRef} role="log" aria-live="polite">
          {messages.length === 0 && !pendingQuestion && phase === "idle" ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-full bg-[#f4f4f4] text-xl font-semibold">W</div>
              <h2 className="m-0 text-2xl font-semibold tracking-tight">今天有什么想了解的？</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">向你的知识库提问，WeKnora 会结合相关资料为你整理答案。</p>
            </div>
          ) : null}
          <KnowledgeNotice reason={reason} />
          {detail && detail.continuable === false ? (
            <p className="rounded-xl bg-[#f3f3f3] px-3 py-2 text-sm">这段对话不能继续提问</p>
          ) : null}
          {notice ? (
            <p className="rounded-xl bg-[#f8e8e4] px-3 py-2 text-sm text-danger">{notice}</p>
          ) : null}
          {messages.map((message) =>
            message.role === "user" ? (
              <article
                className="ml-auto max-w-[82%] rounded-3xl bg-[#f4f4f4] px-5 py-3 leading-7"
                key={message.id}
              >
                {message.body}
              </article>
            ) : (
              <AnswerPane
                key={message.id}
                status={
                  message.status === "interrupted"
                    ? "failed"
                    : message.status === "streaming"
                      ? "streaming"
                      : "complete"
                }
                body={message.body}
              />
            ),
          )}
          {pendingQuestion ? (
            <article className="ml-auto max-w-[80%] rounded-2xl border border-line bg-paper px-4 py-3">
              {pendingQuestion}
            </article>
          ) : null}
          {phase === "waiting" || phase === "streaming" || phase === "complete" || phase === "failed" ? (
            <AnswerPane status={phase} body={liveBody} />
          ) : null}
        </div>
        <Composer
          value={draft}
          disabled={askingDisabled}
          onChange={setDraft}
          onSubmit={() => void submit()}
          accessory={<span className="text-sm text-muted">{knowledgeName}</span>}
        />
      </section>
      <div className="desk:min-h-[calc(100vh-6.5rem)]">
        <CitationRail citations={railCitations} settled={settled && phase !== "waiting" && phase !== "streaming"} />
      </div>
    </div>
  );
}

function applyStreamOutcome(
  detail: Conversation | null,
  phase: AnswerStatus | "idle",
  streamedCitations: Citation[],
): Conversation | null {
  if (!detail?.messages || (phase !== "complete" && phase !== "failed")) {
    return detail;
  }
  const mapped = detail.messages.map((message, index, rows) => {
    const isLastAssistant =
      message.role === "assistant" && rows.slice(index + 1).every((item) => item.role !== "assistant");
    if (!isLastAssistant) {
      return message;
    }
    const status =
      message.status === "streaming"
        ? phase === "failed"
          ? "interrupted"
          : "complete"
        : message.status;
    const citations =
      message.citations && message.citations.length > 0 ? message.citations : streamedCitations;
    return { ...message, status, citations };
  });
  return { ...detail, messages: mapped };
}

function lastAssistantSettled(detail: Conversation | null, phase: AnswerStatus | "idle") {
  if (phase !== "idle" || !detail?.messages) {
    return false;
  }
  const assistant = [...detail.messages].reverse().find((message) => message.role === "assistant");
  return assistant?.status === "complete" || assistant?.status === "interrupted";
}

function lastCitations(detail: Conversation | null): Citation[] {
  const assistant = [...(detail?.messages ?? [])].reverse().find((message) => message.role === "assistant");
  return assistant?.citations ?? [];
}
