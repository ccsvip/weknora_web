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
  onOpenActivity?: () => void;
  onLogout?: () => void;
}

export function KnowledgeNotice({ reason }: { reason: string }) {
  if (reason === "no_knowledge_bases") {
    return <p className="chat-banner">没有可访问的知识库</p>;
  }
  if (reason === "missing_capability") {
    return <p className="chat-banner">当前密钥缺少所需能力</p>;
  }
  if (reason === "upstream_forbidden") {
    return <p className="chat-banner">上游拒绝列出知识库</p>;
  }
  if (reason === "upstream_unreachable") {
    return <p className="chat-banner">暂时连不上知识库</p>;
  }
  return null;
}

export function ConversationPage({ onOpenActivity, onLogout }: ConversationPageProps = {}) {
  const [reason, setReason] = useState("none");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<AnswerStatus | "idle">("idle");
  const [liveBody, setLiveBody] = useState("");
  const [liveCitations, setLiveCitations] = useState<Citation[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [notice, setNotice] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  async function refreshList() {
    const payload = await listConversations();
    setConversations(payload.data ?? []);
  }

  useEffect(() => {
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
    void refreshList().catch(() => {
      setNotice("暂时连不上对话列表");
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void getConversation(selectedId).then((payload) => setDetail(payload.data ?? null));
  }, [selectedId]);

  const askingDisabled =
    reason === "no_knowledge_bases" ||
    reason === "missing_capability" ||
    reason === "upstream_forbidden" ||
    reason === "upstream_unreachable" ||
    phase === "waiting" ||
    phase === "streaming" ||
    (detail !== null && detail.continuable === false);

  const settled = phase === "complete" || phase === "failed" || lastAssistantSettled(detail, phase);
  const railCitations = phase === "waiting" || phase === "streaming" || phase === "complete" || phase === "failed"
    ? liveCitations
    : lastCitations(detail);
  const messages = detail?.messages ?? [];
  const hasTranscript = messages.length > 0 || pendingQuestion !== "" || phase === "waiting" || phase === "streaming" || phase === "failed";
  const showEmptyCitations = settled && phase !== "waiting" && phase !== "streaming" && railCitations.length === 0 && (messages.some((message) => message.role === "assistant") || phase === "failed" || phase === "complete");

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
      }
      await streamMessage(conversationId, content, (event, data) => {
        if (event === "message") {
          setPhase("streaming");
          setLiveBody((current) => current + String(data.delta ?? ""));
        } else if (event === "references") {
          const citations = Array.isArray(data.citations) ? (data.citations as Citation[]) : [];
          setLiveCitations(citations);
        } else if (event === "error") {
          setPhase("failed");
          setNotice(String(data.message ?? "回答失败"));
        } else if (event === "done") {
          setPhase(data.status === "complete" ? "complete" : "failed");
        }
      });
      const refreshed = await getConversation(conversationId);
      setDetail(refreshed.data ?? null);
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

  const knowledgeName = detail?.knowledge_base_name || knowledgeBases.find((item) => item.id === knowledgeBaseId)?.name || "知识库";
  const thread = (
    <>
      <KnowledgeNotice reason={reason} />
      {detail && detail.continuable === false ? <p className="chat-banner">这段对话不能继续提问</p> : null}
      {notice ? <p className="chat-banner is-fail">{notice}</p> : null}
      {messages.map((message) =>
        message.role === "user" ? (
          <article className="chat-user" key={message.id}>
            <div>{message.body}</div>
          </article>
        ) : (
          <AnswerPane
            key={message.id}
            status={message.status === "interrupted" ? "failed" : message.status === "streaming" ? "streaming" : "complete"}
            body={message.body}
            citations={message.citations}
          />
        ),
      )}
      {pendingQuestion ? (
        <article className="chat-user">
          <div>{pendingQuestion}</div>
        </article>
      ) : null}
      {phase === "waiting" || phase === "streaming" || phase === "failed" ? (
        <AnswerPane status={phase} body={liveBody} citations={liveCitations} />
      ) : null}
      {showEmptyCitations ? <CitationRail citations={[]} settled /> : null}
    </>
  );

  return (
    <div className={navOpen ? "chat is-nav-open" : "chat"}>
      {navOpen ? (
        <button type="button" className="chat-backdrop" aria-label="关闭历史" onClick={() => setNavOpen(false)} />
      ) : null}
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          resetLive();
          setNavOpen(false);
        }}
        onCreate={() => {
          setSelectedId(null);
          setDetail(null);
          resetLive();
          setNavOpen(false);
        }}
        onDelete={(id) => {
          void deleteConversation(id)
            .then(() => {
              if (selectedId === id) {
                setSelectedId(null);
                setDetail(null);
              }
              return refreshList();
            })
            .catch((caught: unknown) => {
              setNotice(caught instanceof ApiError ? caught.message : "删除没有完成，对话仍保留");
            });
        }}
        onOpenActivity={onOpenActivity}
        onLogout={onLogout}
      />
      <main className={hasTranscript ? "chat-main" : "chat-main is-empty"}>
        <button type="button" className="chat-menu" aria-label="打开历史" onClick={() => setNavOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {hasTranscript ? (
          <>
            <div className="chat-scroll" ref={threadRef} role="log" aria-label="当前对话">
              {thread}
            </div>
            <div className="chat-dock">
              <Composer
                value={draft}
                disabled={askingDisabled}
                onChange={setDraft}
                onSubmit={() => void submit()}
                accessory={<span className="chat-kb">{knowledgeName}</span>}
              />
            </div>
          </>
        ) : (
          <div className="chat-hero">
            <h1>有什么可以帮忙的？</h1>
            {thread}
            <Composer
              value={draft}
              disabled={askingDisabled}
              onChange={setDraft}
              onSubmit={() => void submit()}
              accessory={
                knowledgeBases.length > 0 ? (
                  <select className="chat-kb" aria-label="知识库" value={knowledgeBaseId} onChange={(event) => setKnowledgeBaseId(event.target.value)}>
                    {knowledgeBases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="chat-kb">{knowledgeName}</span>
                )
              }
            />
          </div>
        )}
      </main>
    </div>
  );
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
