import type { Conversation } from "../services/api";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onOpenActivity?: () => void;
  onLogout?: () => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
  onCreate,
  onOpenActivity,
  onLogout,
}: ConversationListProps) {
  const groups = groupConversations(conversations);

  return (
    <aside className="chat-side" aria-label="历史对话">
      <button type="button" className="chat-new" onClick={onCreate}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M13.2 7.2l3.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        新对话
      </button>
      <div className="chat-history">
        {groups.length === 0 ? <p className="chat-history-empty">还没有对话</p> : null}
        {groups.map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            {group.items.map((conversation) => (
              <div key={conversation.id} className={conversation.id === selectedId ? "chat-row is-active" : "chat-row"}>
                <button type="button" className="chat-open" onClick={() => onSelect(conversation.id)}>
                  <span>{conversation.title}</span>
                </button>
                <button
                  type="button"
                  className="chat-del"
                  aria-label={`删除${conversation.title}`}
                  onClick={() => {
                    if (window.confirm(`删除「${conversation.title}」？`)) {
                      onDelete(conversation.id);
                    }
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
      <footer className="chat-foot">
        {onOpenActivity ? (
          <button type="button" onClick={onOpenActivity}>
            活动记录
          </button>
        ) : null}
        {onLogout ? (
          <button type="button" onClick={onLogout}>
            退出
          </button>
        ) : null}
      </footer>
    </aside>
  );
}

function groupConversations(conversations: Conversation[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "更早", items: [] },
  ];
  const ordered = [...conversations].sort((left, right) => +new Date(right.updated_at) - +new Date(left.updated_at));
  for (const conversation of ordered) {
    const time = new Date(conversation.updated_at);
    if (time >= startOfToday) {
      groups[0].items.push(conversation);
    } else if (time >= startOfYesterday) {
      groups[1].items.push(conversation);
    } else {
      groups[2].items.push(conversation);
    }
  }
  return groups.filter((group) => group.items.length > 0);
}
