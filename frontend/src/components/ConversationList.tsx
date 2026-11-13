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
  const groups = groupConversations(conversations);

  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border border-line bg-[#fffdf8]/80 p-4" aria-label="历史对话">
      <button
        type="button"
        className="mb-3 rounded-full border border-accent bg-accent px-3 py-2 text-sm text-paper"
        onClick={onCreate}
      >
        新对话
      </button>
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.length === 0 ? <p className="text-sm text-muted">还没有对话</p> : null}
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{group.label}</h2>
            {group.items.map((conversation) => (
              <div
                key={conversation.id}
                className={`mb-1 flex items-center rounded-xl ${conversation.id === selectedId ? "border border-accent" : ""}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-left text-ink"
                  onClick={() => onSelect(conversation.id)}
                >
                  <span className="block truncate">{conversation.title}</span>
                  <small className="text-muted">{formatTime(conversation.updated_at)}</small>
                </button>
                <button
                  type="button"
                  className="mr-1 grid h-7 w-7 place-items-center rounded-lg text-muted"
                  aria-label={`删除${conversation.title}`}
                  onClick={() => {
                    if (window.confirm(`删除「${conversation.title}」？`)) {
                      onDelete(conversation.id);
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
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
