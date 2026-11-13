import { useEffect, useState } from "react";

import { listActivity, type ActivityRecord } from "../services/api";

const KIND_LABELS: Record<string, string> = {
  conversation_created: "创建",
  message_completed: "完成",
  message_failed: "失败",
  conversation_deleted: "删除",
};

interface ActivityPageProps {
  initialRecords?: ActivityRecord[];
  initialConversationId?: string;
}

export function ActivityPage({
  initialRecords,
  initialConversationId = "",
}: ActivityPageProps = {}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [rows, setRows] = useState<ActivityRecord[]>(initialRecords ?? []);

  useEffect(() => {
    const query = conversationId.trim();
    void listActivity(query || undefined).then((payload) => setRows(payload.data ?? []));
  }, [conversationId]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="m-0 font-serif text-3xl font-normal">活动记录</h1>
      <label className="mt-6 grid max-w-sm gap-2 text-sm">
        按对话筛选
        <input
          value={conversationId}
          placeholder="对话编号"
          className="rounded-xl border border-line bg-[#fffdf8] px-3 py-2 text-base text-ink"
          onChange={(event) => setConversationId(event.target.value)}
        />
      </label>
      <ul className="mt-6 list-none p-0">
        {rows.map((row) => (
          <li className="grid gap-1 border-b border-line py-4 sm:grid-cols-[7rem_1fr_4rem_1fr]" key={row.id}>
            <span className="text-sm text-muted">{formatTime(row.created_at)}</span>
            <strong>{row.conversation_title}</strong>
            <span>{KIND_LABELS[row.kind] ?? row.kind}</span>
            <span className="text-muted">{row.summary}</span>
          </li>
        ))}
      </ul>
    </main>
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
