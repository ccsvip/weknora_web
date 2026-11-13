# WeKnora v0.9.0 Client Contract

本文件是服务端唯一上游客户端必须遵守的契约。页面和其他模块不得读取它来直接发请求。
锁定版本：WeKnora v0.9.0，基址来自 `WEKNORA_BASE_URL`。

## 认证

- 每个请求只加请求头 `X-API-Key`，值来自 `WEKNORA_API_KEY`。
- 不发送 `X-Tenant-ID`。
- 不发送 `Authorization`。
- 不把密钥写入日志、异常文本、活动记录或对本产品浏览器的响应。
- HTTP 403 与 409 各只尝试一次。不得更换租户、密钥或知识库后再试。

需要的能力是 `retrieve` 与 `chat`。不使用 `ingest`、`read_agents`、`manage_agents`、`manage_kbs`。

## 列出知识库

`GET /api/v1/knowledge-bases`

成功：`200`，`{ "success": true, "data": [ { "id", "name", "description" } ] }`。
客户端只保留 `id`、`name`、`description`。空数组是合法成功，表示没有可访问的知识库。

失败：标准失败信封。`403` 映射为本产品的 `missing_capability` 或 `upstream_forbidden`，不映射成空知识库。

## 创建会话

`POST /api/v1/sessions`

请求体只含标题：`{ "title": "<知识库名称>" }`。不发送 `kind`，让 v0.9.0 使用它的普通会话默认值。不得发送 `assistant`。不在创建会话时绑定知识库；知识库 id 只出现在后续的知识对话请求里。

成功：HTTP 200 或 201，且体为 `{ "success": true, "data": { "id": "<session id>" } }`。客户端保存 `data.id`。

失败：不创建本地对话。

## 知识对话

`POST /api/v1/knowledge-chat/{session_id}`

请求体只有这次的新问题：

```json
{
  "query": "<新问题>",
  "knowledge_base_ids": ["<这一段对话绑定的知识库 id>"]
}
```

成功响应：`200`，`Content-Type: text/event-stream`。

每条事件的 `data` 是 JSON 对象：

| 字段 | 用法 |
|------|------|
| `response_type` | 只把 `answer` 的 `content` 累加进回答。`error` 使消息中断。其他类型不写入回答正文 |
| `content` | `answer` 的新增文本 |
| `done` | 为真时结束成功路径 |
| `knowledge_references` | 引用数组。使用 `knowledge_title`、`content`、`knowledge_id` |
| `id` | 可忽略 |

事件名 `complete`，或 `done == true`，表示正常结束。
连接在此之前断开，表示中断，已累加的 `answer` 文本保留。
`knowledge_references` 缺失或为空：不创建引用。

不得把本地历史拼进 `query`。不得补发中断消息。

## 删除会话

`DELETE /api/v1/sessions/{id}`

成功：`200`，`{ "success": true, "message": "Session deleted successfully" }`。
失败：调用方必须停止，不得删除本地对话。

会话标识为空时，不调用本接口。

## 失败信封

非 2xx 且体为 JSON 时，读取：

```json
{
  "success": false,
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

`details` 不得原样返回给浏览器。映射规则：

| 上游 | 本产品错误码 |
|------|----------------|
| 403 | `upstream_forbidden` |
| 409 | `upstream_conflict` |
| 其他 HTTP 或连接错误 | `upstream_failed` 或 `upstream_unavailable` |

## 契约测试必须覆盖

- 成功列出知识库，以及 `data` 为空。
- 创建会话成功与失败。
- SSE：只有 `answer` 进入正文；`thinking` 不进入正文；`knowledge_references` 成为引用；`complete` 结束。
- SSE 在 `complete` 前断开，调用方得到中断和已收到的正文。
- 空 `knowledge_references` 不产生引用。
- 403 与 409 的假上游只收到一次请求。
- 继续提问的请求体只有新 `query` 和该对话的一个知识库 id。
