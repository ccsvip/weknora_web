import { useEffect, useState } from "react";

import { listActivity, type ActivityRecord } from "../services/api";

const KIND_LABELS: Record<string, string> = {
  conversation_created: "创建",
  message_completed: "完成",
  message_failed: "失败",
  conversation_deleted: "删除",
};

export function ActivityPage() {
  const [conversationId, setConversationId] = useState("");
  const [rows, setRows] = useState<ActivityRecord[]>([]);

  useEffect(() => {
    const query = conversationId.trim();
    void listActivity(query || undefined).then((payload) => setRows(payload.data));
  }, [conversationId]);

  return (
    <main className="activity">
      <h1>活动记录</h1>
      <label className="filter">
        按对话筛选
        <input
          value={conversationId}
          placeholder="对话编号"
          onChange={(event) => setConversationId(event.target.value)}
        />
      </label>
      <ul>
        {rows.map((row) => (
          <li className="activity-row" key={row.id}>
            <span>{formatTime(row.created_at)}</span>
            <strong>{row.conversation_title}</strong>
            <span>{KIND_LABELS[row.kind] ?? row.kind}</span>
            <span>{row.summary}</span>
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
