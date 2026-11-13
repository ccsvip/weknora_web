import { useEffect, useState } from "react";

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

export function KnowledgeNotice({ reason }: { reason: string }) {
  if (reason === "no_knowledge_bases") {
    return <p className="state state-empty">没有可访问的知识库</p>;
  }
  if (reason === "missing_capability") {
    return <p className="state state-missing">当前密钥缺少所需能力</p>;
  }
  if (reason === "upstream_forbidden") {
    return <p className="state state-failed">上游拒绝列出知识库</p>;
  }
  if (reason === "upstream_unreachable") {
    return <p className="state state-failed">暂时连不上知识库</p>;
  }
  return null;
}

export function ConversationPage() {
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

  async function refreshList() {
    const payload = await listConversations();
    setConversations(payload.data);
  }

  useEffect(() => {
    void listKnowledgeBases().then((payload) => {
      setReason(payload.reason);
      setKnowledgeBases(payload.data);
      setKnowledgeBaseId(payload.data[0]?.id ?? "");
    });
    void refreshList();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void getConversation(selectedId).then((payload) => setDetail(payload.data));
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
          return;
        }
        const created = await createConversation(knowledgeBaseId);
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
      setDetail(refreshed.data);
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

  return (
    <div className="workspace">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setPhase("idle");
          setLiveBody("");
          setLiveCitations([]);
          setPendingQuestion("");
          setNotice("");
        }}
        onCreate={() => {
          setSelectedId(null);
          setDetail(null);
          setPhase("idle");
          setLiveBody("");
          setLiveCitations([]);
          setNotice("");
        }}
        onDelete={(id) => {
          void deleteConversation(id).then(() => {
            if (selectedId === id) {
              setSelectedId(null);
              setDetail(null);
            }
            return refreshList();
          }).catch((caught: unknown) => {
            setNotice(caught instanceof ApiError ? caught.message : "删除没有完成，对话仍保留");
          });
        }}
      />
      <section className="thread" aria-label="当前对话">
        <KnowledgeNotice reason={reason} />
        {detail && detail.continuable === false ? <p className="state state-failed">这段对话不能继续提问</p> : null}
        {notice ? <p className="error">{notice}</p> : null}
        {!selectedId && knowledgeBases.length > 0 ? (
          <label className="field">
            知识库
            <select className="kb-select" value={knowledgeBaseId} onChange={(event) => setKnowledgeBaseId(event.target.value)}>
              {knowledgeBases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {(detail?.messages ?? []).map((message) =>
          message.role === "user" ? (
            <article className="message user" key={message.id}>
              <div className="bubble">{message.body}</div>
            </article>
          ) : (
            <AnswerPane key={message.id} status={message.status === "interrupted" ? "failed" : message.status === "streaming" ? "streaming" : "complete"} body={message.body} />
          ),
        )}
        {pendingQuestion ? (
          <article className="message user">
            <div className="bubble">{pendingQuestion}</div>
          </article>
        ) : null}
        {phase === "waiting" || phase === "streaming" || phase === "failed" ? (
          <AnswerPane status={phase} body={liveBody} />
        ) : null}
        <Composer value={draft} disabled={askingDisabled} onChange={setDraft} onSubmit={() => void submit()} />
      </section>
      <CitationRail citations={railCitations} settled={settled && phase !== "waiting" && phase !== "streaming"} />
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
