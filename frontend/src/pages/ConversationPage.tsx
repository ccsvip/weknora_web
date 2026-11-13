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
  const message =
    reason === "no_knowledge_bases"
      ? "没有可访问的知识库"
      : reason === "missing_capability"
        ? "当前密钥缺少所需能力"
        : reason === "upstream_forbidden"
          ? "上游拒绝列出知识库"
          : reason === "upstream_unreachable"
            ? "暂时连不上知识库"
            : null;
  if (!message) {
    return null;
  }
  return (
    <div className="mt-6 flex max-w-md items-start gap-3 rounded-2xl border border-[#e9e9e7] bg-[#fafaf9] px-4 py-3 text-left" role="status">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#b98a45]" aria-hidden="true" />
      <p className="m-0 text-sm leading-6 text-muted">{message}</p>
    </div>
  );
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

  const hasCitations = railCitations.length > 0;

  return (
    <div className={`grid min-h-dvh grid-cols-1 desk:grid-cols-[260px_minmax(0,1fr)] ${hasCitations ? "desk:grid-cols-[260px_minmax(0,1fr)_280px]" : ""}`}>
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
        className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-col bg-white desk:h-dvh desk:min-h-0"
        aria-label="当前对话"
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#f0f0f0] px-5 desk:px-8">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-sm font-semibold text-ink">知识库对话</h2>
          </div>
          {knowledgeBases.length > 0 && !detail ? (
            <select
              className="max-w-[45%] rounded-lg border border-[#ededed] bg-white px-3 py-2 text-sm text-ink outline-none transition-colors hover:bg-[#f8f8f8] focus:border-[#b8b8b8]"
              aria-label="知识库"
              value={knowledgeBaseId}
              onChange={(event) => setKnowledgeBaseId(event.target.value)}
            >
              {knowledgeBases.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          ) : (
            <span className="max-w-[45%] truncate rounded-lg bg-[#f5f5f5] px-3 py-2 text-sm text-muted">{knowledgeName}</span>
          )}
        </header>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto px-5 py-8 desk:px-0" ref={threadRef} role="log" aria-live="polite">
          {messages.length === 0 && !pendingQuestion && phase === "idle" ? (
            <div className="my-auto flex min-h-[24rem] flex-col items-center justify-center px-4 text-center">
              <span className="mb-3 text-sm font-medium text-muted">WeKnora · 知识库助手</span>
              <h2 className="m-0 text-[1.8rem] font-semibold tracking-[-0.035em] text-ink desk:text-[2rem]">有什么想了解的？</h2>
              <p className="mt-3 max-w-md text-[15px] leading-7 text-muted">从你的知识库中寻找答案，并附上可追溯的资料来源。</p>
              <KnowledgeNotice reason={reason} />
            </div>
          ) : null}
          {detail && detail.continuable === false ? (
            <p className="mx-auto max-w-3xl rounded-xl bg-[#f5f5f5] px-4 py-3 text-sm text-muted">这段对话不能继续提问</p>
          ) : null}
          {notice ? (
            <p className="mx-auto max-w-3xl rounded-xl bg-[#fff3f0] px-4 py-3 text-sm text-danger" role="alert">{notice}</p>
          ) : null}
          {messages.map((message) =>
            message.role === "user" ? (
              <article className="ml-auto max-w-[82%] rounded-[1.5rem] bg-[#f4f4f4] px-5 py-3.5 leading-7 text-ink" key={message.id}>
                {message.body}
              </article>
            ) : (
              <AnswerPane
                key={message.id}
                status={message.status === "interrupted" ? "failed" : message.status === "streaming" ? "streaming" : "complete"}
                body={message.body}
              />
            ),
          )}
          {pendingQuestion ? (
            <article className="ml-auto max-w-[82%] rounded-[1.5rem] bg-[#f4f4f4] px-5 py-3.5 leading-7">{pendingQuestion}</article>
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
          accessory={<span className="rounded-lg bg-[#f5f5f5] px-2.5 py-1.5 text-xs text-muted">{knowledgeName}</span>}
        />
      </section>
      {hasCitations ? (
        <div className="hidden h-dvh desk:block">
          <CitationRail citations={railCitations} settled={settled && phase !== "waiting" && phase !== "streaming"} />
        </div>
      ) : null}
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
