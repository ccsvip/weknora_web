import type { Conversation } from "../services/api";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
  onCreate,
}: ConversationListProps) {
  return (
    <aside className="list">
      <h2>对话</h2>
      <button type="button" className="quiet" onClick={onCreate}>
        新对话
      </button>
      {conversations.map((conversation) => (
        <div className={conversation.id === selectedId ? "conversation-row active" : "conversation-row"} key={conversation.id}>
          <button type="button" className="quiet" onClick={() => onSelect(conversation.id)}>
            <strong>{conversation.title}</strong>
            <small>{formatTime(conversation.updated_at)}</small>
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              if (window.confirm(`删除「${conversation.title}」？`)) {
                onDelete(conversation.id);
              }
            }}
          >
            删除
          </button>
        </div>
      ))}
    </aside>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
