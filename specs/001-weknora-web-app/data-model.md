# Data Model: WeKnora 网页对话台

存储只保存本产品的对话记录和活动记录。知识库正文、切片和向量不入库。
字段类型按 PostgreSQL 表达。时间一律为带时区的时间戳。

## Conversation

操作者的一段连续提问。属于这一次部署，不按人再拆分。

| 字段 | 类型 | 规则 |
|------|------|------|
| `id` | UUID | 主键，由本产品生成 |
| `weknora_session_id` | 文本，可空 | 唯一。创建对话时由上游 `POST /sessions` 返回。上游会话已确认消失后清空 |
| `knowledge_base_id` | 文本 | 必填，创建后不变 |
| `knowledge_base_name` | 文本 | 必填。创建时取上游名称，之后不因为上游改名而回写 |
| `title` | 文本 | 必填。第一条问题提交前等于知识库名称。第一条非空问题提交时改为该问题去掉首尾空白后的前 40 个字符 |
| `continuable` | 布尔 | 新建为真。知识库不可用或上游会话丢失后为假，不能改回真 |
| `created_at` | 时间戳 | 必填 |
| `updated_at` | 时间戳 | 新消息或标题变化时更新 |

关系：一条对话有多条消息、多条引用（经由消息）和多条活动记录。

删除成功后，这一行及其消息、引用从库中消失。活动记录不随对话级联删除。

## Message

对话中的一条问题或回答。

| 字段 | 类型 | 规则 |
|------|------|------|
| `id` | UUID | 主键 |
| `conversation_id` | UUID | 必填，引用 Conversation |
| `role` | `user` 或 `assistant` | 必填 |
| `body` | 文本 | 用户消息是提交的问题。助手消息只累加上游 `answer` 的 `content`。失败时保留已收到的正文，可以为空 |
| `status` | `complete`、`streaming`、`interrupted` | 见下方状态 |
| `created_at` | 时间戳 | 必填 |

校验：

- 问题去掉首尾空白后为空，拒绝创建，不产生消息。
- 问题字符数大于 8,000，拒绝创建。按提交原文计数。
- 同一对话在存在 `streaming` 助手消息时，拒绝新的问题。
- `continuable` 为假时，拒绝新的问题。已有消息仍可读取。

状态：

- 用户消息创建后即为 `complete`。
- 助手消息创建时为 `streaming`。
- 上游以完成事件结束，且没有错误事件：变为 `complete`。
- 上游错误、连接在完成前断开、或上游 403/409/其他失败：变为 `interrupted`。已收到的 `answer` 文本保留。
- `complete` 与 `interrupted` 不能回到 `streaming`。

继续提问只把这条新的用户消息正文作为上游 `query`。不读取旧消息来拼接请求。

## Citation

某条助手消息的一条上游引用。没有上游引用时不创建行，页面据此显示“没有引用”。

| 字段 | 类型 | 规则 |
|------|------|------|
| `id` | UUID | 主键 |
| `message_id` | UUID | 必填，引用 Message，且该消息角色必须是 `assistant` |
| `knowledge_id` | 文本，可空 | 来自上游 `knowledge_id` |
| `title` | 文本 | 来自 `knowledge_title`。上游为空时存“未命名引用” |
| `excerpt` | 文本 | 来自 `content`，最多保存前 500 个字符 |
| `position` | 整数 | 从 0 起，按上游数组顺序 |

同一助手消息内，以 `knowledge_id` 加 `excerpt` 去重。引用只在该消息结束（完成或中断）时写入一次。

## ActivityRecord

回溯事件。不属于对话正文。

| 字段 | 类型 | 规则 |
|------|------|------|
| `id` | UUID | 主键 |
| `conversation_id` | UUID | 必填，但不做外键。对话删除后仍能按它筛选 |
| `conversation_title` | 文本 | 事件发生时的标题快照 |
| `kind` | 枚举 | `conversation_created`、`message_completed`、`message_failed`、`conversation_deleted` |
| `summary` | 文本 | 给操作者看的短句。不得包含访问口令、上游密钥、会话签名或消息正文 |
| `created_at` | 时间戳 | 必填 |

写入时机：

- 对话和上游会话都创建成功：`conversation_created`。
- 助手消息变为 `complete`：`message_completed`。
- 助手消息变为 `interrupted`：`message_failed`。摘要只含失败类别，不含密钥。
- 上游会话和本地对话都删除成功：`conversation_deleted`。摘要不含消息正文。
- 删除任一步失败：不写 `conversation_deleted`。

列表默认按 `created_at` 倒序。`conversation_id` 查询只返回该对话的事件。

## KnowledgeBaseReference

不单独建表。它是 `GET /api/v1/knowledge-bases` 的即时结果，以及 Conversation 上保存的 `knowledge_base_id` 与 `knowledge_base_name`。

列表项：

| 字段 | 规则 |
|------|------|
| `id` | 上游知识库标识 |
| `name` | 上游名称 |
| `description` | 可空 |
| `accessible` | 当前密钥能否阅读。本接口只返回允许阅读的项，因此成功列表里恒为真 |

当上游拒绝列表、没有知识库或上游不可达时，响应不伪造知识库。用调用结果区分原因：`none`、`no_knowledge_bases`、`missing_capability`、`upstream_unreachable`、`upstream_forbidden`。

## AccessSession

不入库。签名 cookie `weknora_web_access` 即一次通过。

- 正确口令：设置会话 cookie。
- 错误口令：不设置 cookie。
- 主动退出、或浏览器关闭：cookie 消失。
- 产品重启不使尚未关闭的浏览器 cookie 失效。
- cookie 值不是口令，也不能当作 WeKnora 凭证。

## 删除时的一致性

1. 若 `weknora_session_id` 有值，先请求上游删除。
2. 上游失败：本地三张业务表不变，`continuable` 不变，不写删除事件。
3. 上游成功，或本来没有会话标识：一个事务内删除该对话的 Citation、Message、Conversation，并插入 `conversation_deleted`。
4. 第 3 步事务失败：Conversation 仍在；`weknora_session_id` 清空；`continuable` 为假；不写删除事件。
