# Research: WeKnora 网页对话台

本文件解决实现计划里的技术选择。规格中的待定项已在澄清阶段关闭。
宪章 1.1.0 第六条锁定了界面技术栈。下面每一项都是计划必须遵守的决定。

## 1. 服务端语言与框架

- **Decision**: Python 3.12，FastAPI，Pydantic v2，Uvicorn。由单一 WeKnora 客户端模块发出上游请求。
- **Rationale**: 规格允许 Python 或 Go。本产品是单操作者的资源式接口、数据库记录和回答流转发，不是另一套检索系统。FastAPI 能用类型模型表达资源，并用流式响应把上游回答逐段转给页面。失败信封、403 不重试和删除顺序都可以放在一个小模块里，并用注释说明原因。
- **Alternatives considered**: Go 更接近 WeKnora 本身，也适合长连接。本产品的规模是一名操作者和至少 100 段对话，不需要为吞吐再引入一套更重的服务端写法。Node 不得作为持有密钥、数据库或 WeKnora 客户端的服务端语言。

## 2. 记录存储

- **Decision**: PostgreSQL 16。表结构由 Alembic 迁移管理。容器内端口只来自 `POSTGRES_PORT`。
- **Rationale**: 对话、消息、引用和活动记录必须在重启后仍在，删除必须要么完整成功，要么本地记录保持原样。PostgreSQL 的事务能把“删消息、删引用、写删除事件”放在同一次提交里。
- **Alternatives considered**: SQLite 少一个容器，但规格要求这一条启动命令同时拉起网页、服务端和数据库。PostgreSQL 官方镜像满足这个形状，也避免流式写入和删除抢同一文件。

## 3. 网页框架、路由、打包与视觉

- **Decision**:
  - 页面用 React 19 与 TypeScript。
  - 应用框架用 TanStack Start，路由与首次数据加载用 TanStack Router 文件路由。
  - 开发热更新与上线打包用 Vite 7。`@tanstack/react-start` 的 peer 要求 `vite >= 7`。
  - 开启 TanStack Start 的 SPA 模式：`tanstackStart({ spa: { enabled: true } })`。
  - 生产网页容器继续用 nginx 托管构建出的静态 shell，不运行 Node。
  - 不启用 Start 的 server functions、API routes 或 Nitro。WeKnora 密钥、数据库和上游调用只留在 Python。
  - 布局、颜色、间距与宽屏/窄屏显示用 Tailwind CSS v4（`@tailwindcss/vite` + CSS `@theme`）。
  - 页面只请求本产品的 `/api/v1`。
- **Rationale**: 宪章第六条锁定了上述界面技术。SPA 模式让 Start 仍然负责框架、路由和 loader，同时构建结果是静态 HTML/JS，网页容器不必成为第二套服务端。构建阶段的 Node 只执行 `vite build`。loader 与 `beforeLoad` 在浏览器里请求同源 `/api/v1`，首次数据加载发生在路由匹配之后、页面组件渲染之前。这样既满足“TanStack Start + Router 负责首次数据加载”，又不把上游密钥放进 JS 包。
- **Alternatives considered**:
  - 仅用 Vite + React、不用 Start/Router：违反第六条。
  - TanStack Start 全量 SSR / Nitro Node 进程：规格把服务端语言限制在 Python 或 Go，Node 进程容易变成第二套会持有密钥的服务端，也重复了 Python 已经提供的资源接口。
  - Next.js：同样会把页面和服务端包在一起，上游调用容易离开唯一的 Python 客户端。
  - Vue 3：宪章已锁定 React 19。

路由（实现必须落地，见 [contracts/web-ui.md](contracts/web-ui.md)）：

- `/login`：访问口令。未通过时只显示这一页。
- `/`：对话台。loader 拉取知识库列表与对话列表；若 URL 带有选中的对话，再拉取该对话。
- `/activity`：活动记录。loader 拉取活动记录，可按对话筛选。
- 已通过口令的布局路由用 `beforeLoad` 探测访问会话；收到 `access_required` 时重定向到 `/login`。
- 不在组件里用本地 `useState` 切换“对话 / 记录”两个整页，以免绕过 Router。

视觉体系（实现必须落地，用 Tailwind `@theme` 表达，不能改成浏览器默认表单或通用紫渐变后台）：

- 宽屏（视口宽度至少 1100px）：左侧对话列表，中间对话，右侧引用。窄屏可以改成上下排列，不作为本规格的验收视口。
- 回答正文使用 Source Serif 4，界面文字使用 Source Sans 3。
- 颜色只从这组 token 取出，并写成 Tailwind 主题色：纸色 `#f6f1e7`，墨色 `#1c1915`，弱墨 `#5c564c`，线条 `#e4dccf`，强调色 `#0f6e56`，失败色 `#9f2d2d`。
- 六种状态必须用不同的文字和外观同时表达：没有知识库、等待、进行中、完成、失败、没有引用。颜色不能是唯一区分。
- 引用呈现为旁注，不混进回答正文。

生产托管：

- 构建产物由 nginx 提供。非 `/api` 路径刷新必须回到 SPA shell（构建输出的 `_shell.html` 或被复制成 `index.html` 的等价文件）。
- `/api` 反代到 Python，并关闭该路径缓冲。
- 不要对需要访问 cookie 的路由做带数据的 prerender。构建环境没有口令会话，也没有上游密钥。

开发时：Vite 7 把 `/api` 代理到 `API_PORT` 上的 Python 服务端，代理超时足够覆盖一次知识对话流。

网页镜像的构建阶段使用 Node 22.12+（Start 的 engines 下限）。运行时镜像仍是 nginx。

## 4. 对接的 WeKnora 版本与调用面

- **Decision**: 锁定 WeKnora v0.9.0（发布于 2026-10-29）。只调用下面四个接口，并且只发送 `X-API-Key`，不发送 `X-Tenant-ID`，也不使用用户 JWT。
  - `GET /api/v1/knowledge-bases`，能力 `retrieve`
  - `POST /api/v1/sessions`，能力 `chat`，普通会话
  - `POST /api/v1/knowledge-chat/{session_id}`，能力 `chat` 与 `retrieve`，响应为 SSE
  - `DELETE /api/v1/sessions/{id}`，能力 `chat`
- **Rationale**: 宪章要求计划写明版本，并要求知识能力只走已发布的 HTTP API。v0.9.0 文档说明列出知识库使用 `retrieve`，因此本功能不申请 `manage_kbs`、`ingest`、`read_agents` 或 `manage_agents`。工作区密钥不能拿去切换租户，所以客户端不添加租户头。
- **Alternatives considered**: 不锁版本会让字段和事件名在实现中途变化。直接调用模型或向量库被宪章禁止。

上游成功体为 `{ "success": true, "data": ... }`。失败体为 `{ "success": false, "error": { "code", "message", "details" } }`。删除成功体为 `{ "success": true, "message": "Session deleted successfully" }`。

知识对话的 SSE `data` 是 `StreamResponse`。实现只把 `response_type == "answer"` 的 `content` 累加为回答正文。引用取 `knowledge_references[]` 的 `knowledge_title` 与 `content`。`thinking`、`tool_call`、`tool_result` 不写入回答正文。连接在 `complete` 之前断开，或收到 `response_type == "error"`，都视为中断。没有 `knowledge_references` 时，页面显示“没有引用”，不补写引用。

继续提问时，只把新问题作为 `query` 发给已绑定的 `session_id`，并带上该对话唯一的 `knowledge_base_ids`。不重放本地历史。

收到 HTTP 403 或 409 时只记录这一次失败，不更换租户、不更换密钥、不自动重试。

## 5. 访问口令如何在重启后仍然有效

- **Decision**: 登录成功后设置名为 `weknora_web_access` 的浏览器会话 cookie。属性为 `HttpOnly`、`SameSite=Lax`、`Path=/`，不设置 `Max-Age` 或 `Expires`。值为由 `ACCESS_SESSION_SECRET` 签名的时间戳，不含口令。`ACCESS_COOKIE_SECURE=true` 时才加 `Secure`。主动退出把该 cookie 清掉。
- **Rationale**: 规格要求同一浏览器在关闭或主动退出前保持通过，刷新、站内跳转和产品重启都不得单独要求再次输入口令。不带过期时间的会话 cookie 会在浏览器关闭时消失。签名放在 cookie 里，服务端重启后仍能校验，不把登录状态放进会丢失的内存。
- **Alternatives considered**: 服务端内存会话在重启后会把操作者踢出，直接违反规格。把口令放进 `localStorage` 会让页面持有凭证。固定 12 小时过期是澄清时没有选的方案。

访问口令、上游密钥、会话签名密钥或数据库密码缺失，或去掉空白后为空，进程必须在开始监听之前以非零状态退出，并在日志里说明缺少哪一项配置名。日志不得打印这些值。

## 6. 删除顺序

- **Decision**: 先删除 WeKnora 会话。上游删除失败时，本地对话、消息和引用保持原样，返回失败，不写删除事件。上游删除成功后，再在一个数据库事务里删除本地对话及其消息、引用，并写入不含正文的删除事件。若这个本地事务失败，对话必须仍然存在，标记为不能继续提问，清空已失效的上游会话标识，不写删除事件。
- **Rationale**: 澄清结论禁止“本地没了、WeKnora 还在”。先删上游才能保证失败时本地仍可打开。本地事务失败时，上游会话已经不在，规格要求本地记录保留并显示失败，这与“上游会话丢失则只能阅读”的规则一致。
- **Alternatives considered**: 先删本地无法在上游失败时恢复本地记录。软删除是澄清时没有选的方案。

## 7. 本产品的资源式接口与页面取流

- **Decision**: 页面只使用 `/api/v1` 下的资源：访问会话、知识库、对话、消息、活动记录，以及不含业务数据的存活检查。创建消息的响应是 `text/event-stream`，事件名为 `message`、`references`、`done`、`error`。网页容器把 `/api` 反代到服务端，并关闭该路径的响应缓冲。页面用 `fetch` 读取该 SSE 流（`credentials: "include"`，`ReadableStream` 按块解析），按到达顺序把 `message` 事件的正文追加到进行中的回答。不得使用 `EventSource`（不能 POST，也不能携带本产品的创建请求体）。不得直连 WeKnora。
- **Rationale**: 规格要求对话、消息和记录按资源创建、读取和删除。把提问做成 `/ask` 这类动作接口会违反这条约束。反代让浏览器只看见一个入口，上游地址和密钥留在服务端。Fetch 读流满足宪章第六条，也满足“回答期间至少每秒更新一次已收到的内容”。未结束的流必须标为进行中，不得当作完整答案。
- **Alternatives considered**: 浏览器直接请求 WeKnora 会把 API Key 暴露给页面，被宪章禁止。先返回完整回答再一次性显示，不能满足逐步出现的验收。`EventSource` 只能 GET，无法创建消息资源。

## 8. 测试策略

- **Decision**: 服务端用 pytest。WeKnora 客户端用本地假上游做契约测试，覆盖成功信封、失败信封、SSE 正常结束、SSE 中断、403 与 409 只请求一次、空引用。页面用 Vitest 与 Testing Library 覆盖六种状态、Markdown 渲染（表格、列表、代码块）、进行中流不得显示为完成，以及未登录访问 `/` 或 `/activity` 时进入 `/login`。不在计划中引入真实 WeKnora 作为必需测试依赖。
- **Rationale**: 宪章要求每个用到的上游端点组都有契约测试。假上游能稳定制造 403、中断和空引用。真实上游留给操作者按 quickstart 做端到端验收。
- **Alternatives considered**: 只做手工验收无法阻止客户端被页面绕开，也无法固定“403 不重试”这种计数行为。

## 9. 回答中的 Markdown

- **Decision**: 助手回答正文用 `react-markdown` 渲染，并启用 `remark-gfm`，以显示表格、任务列表、删除线、自动链接、列表和代码块。进行中的回答每追加一段文字就重新渲染；流未结束时组件的可观察状态仍是进行中。渲染库不得改写或补全上游没有给出的引用。
- **Rationale**: 宪章第六条要求把回答中的 Markdown 显示成表格、列表、代码块等。知识正文仍只来自 WeKnora 经本产品转发的 `answer` 文本。
- **Alternatives considered**: 把 Markdown 当纯文本显示，无法验收表格和代码块。在服务端把 Markdown 转成 HTML 再发给页面，会把展示规则拆出界面层，也增加 XSS 面；`react-markdown` 默认不走 `dangerouslySetInnerHTML`。
