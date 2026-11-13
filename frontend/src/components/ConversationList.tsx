import { deleteAccessSession, type Conversation } from "../services/api";

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
  function signOut() {
    void deleteAccessSession().finally(() => {
      window.location.assign("/login");
    });
  }

  return (
    <aside
      className="relative z-20 flex h-14 shrink-0 items-center gap-2 bg-[#f7f7f8] px-3 desk:h-dvh desk:w-[260px] desk:flex-col desk:items-stretch desk:gap-0 desk:overflow-hidden desk:px-3 desk:py-4"
      aria-label="导航与历史对话"
    >
      <a href="/" className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-[15px] font-semibold text-ink no-underline hover:bg-black/5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-sm font-semibold text-white">W</span>
        <span className="hidden desk:inline">WeKnora</span>
      </a>
      <div className="ml-auto flex min-w-0 items-center gap-2 desk:ml-0 desk:mt-4 desk:block">
        <a href="/activity" className="hidden rounded-lg px-3 py-2.5 text-sm text-muted no-underline hover:bg-black/5 hover:text-ink desk:flex desk:items-center desk:gap-2">
          <ActivityIcon />
          活动记录
        </a>
        <button
          type="button"
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ececec] px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-[#e5e5e5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink desk:mb-3 desk:mt-2 desk:w-full desk:justify-start desk:px-3 desk:py-2.5"
          onClick={onCreate}
        >
          <PlusIcon />
          <span className="hidden desk:inline">新对话</span>
          <span className="desk:hidden">新建</span>
        </button>
        <a href="/activity" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted no-underline hover:bg-black/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink desk:hidden" aria-label="活动记录">
          <ActivityIcon />
        </a>
        {conversations.length > 0 ? (
          <select
            className="min-w-0 max-w-[9rem] rounded-lg border-0 bg-transparent px-1 py-2 text-sm text-ink outline-none desk:hidden"
            aria-label="历史对话"
            value={selectedId ?? ""}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">历史对话</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
            ))}
          </select>
        ) : null}
        <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-black/5 desk:hidden" aria-label="退出登录" onClick={signOut}>
          <SignOutIcon />
        </button>
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto desk:block">
        <h2 className="mb-2 mt-3 px-2 text-xs font-medium text-muted">最近</h2>
        {groups.length === 0 ? <p className="px-2 text-sm text-muted">还没有对话</p> : null}
        {groups.map((group) => (
          <section key={group.label}>
            <h3 className="mb-1 mt-4 px-2 text-xs font-medium text-muted">{group.label}</h3>
            {group.items.map((conversation) => (
              <div key={conversation.id} className={`group mb-0.5 flex items-center rounded-lg ${conversation.id === selectedId ? "bg-[#e9e9e9]" : "hover:bg-[#eeeeee]"}`}>
                <button type="button" className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[13px] text-ink" onClick={() => onSelect(conversation.id)}>
                  {conversation.title}
                </button>
                <button type="button" className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted opacity-0 hover:bg-black/5 group-hover:opacity-100 focus:opacity-100" aria-label={`删除${conversation.title}`} onClick={() => {
                  if (window.confirm(`删除「${conversation.title}」？`)) onDelete(conversation.id);
                }}>
                  ×
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="mt-auto hidden border-t border-black/10 pt-3 desk:block">
        <button type="button" className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-muted hover:bg-black/5 hover:text-ink" onClick={signOut}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e5e5e5] text-xs font-medium text-ink">用</span>
          退出登录
        </button>
      </div>
    </aside>
  );
}

function ActivityIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13h4l3-8 4 14 3-6h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

function SignOutIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-8h6a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
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
