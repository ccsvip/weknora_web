# Web UI Contract

本文件约束浏览器里的界面层。它不替代 [openapi.yaml](openapi.yaml)。
页面、组件和 Router loader 只请求本产品 `/api/v1`，不得请求 WeKnora。

## 技术栈（不可替换）

- React 19 与 TypeScript
- TanStack Start（SPA 模式）与 TanStack Router 文件路由
- Tailwind CSS v4
- Vite 7
- react-markdown 与 remark-gfm
- `fetch` 读取本产品的 SSE

禁止：

- 启用 TanStack Start server functions、API routes 或 Nitro 去访问 WeKnora、数据库或部署密钥
- 在浏览器包、`import.meta.env` 的可公开变量、前端存储或日志中放入 `WEKNORA_API_KEY`、访问口令或会话签名密钥
- 用 `EventSource` 创建消息（必须 POST JSON 并读取 `text/event-stream`）
- 用本地 `useState` 在整页之间切换来代替路由

## 路由

| 路径 | 谁可以打开 | 首次数据加载 | 画面 |
|------|------------|--------------|------|
| `/login` | 任何人 | 无业务 loader | 访问口令 |
| `/` | 已通过口令 | 知识库列表、对话列表；若选中对话则再取该对话 | 对话台 |
| `/activity` | 已通过口令 | 活动记录；可带对话筛选 | 活动记录 |

已通过口令的布局在 `beforeLoad` 中探测访问会话。收到 `access_required` 时重定向到 `/login`。主动退出后回到 `/login`。

宽屏（≥1100px）下，`/` 同时显示对话列表、当前对话与引用旁注。

## Fetch 与 SSE

创建消息：

```http
POST /api/v1/conversations/{conversationId}/messages
Content-Type: application/json

{"content":"<问题>"}
```

响应 `text/event-stream`。客户端：

1. 使用 `fetch`，`credentials: "include"`。
2. 用 `response.body.getReader()` 按块解码。
3. 按空行分帧，读取 `event:` 与 `data:`。
4. `message`：把正文追加到当前助手消息，状态保持 `streaming`。
5. `references`：结束时展示引用；没有引用则显示“没有引用”。
6. `done`：状态变为完成。
7. `error` 或连接在 `done` 前断开：已收到的文字保留，状态变为中断。

在 `done` 之前，画面不得把该回答标为完成。

## Markdown

助手消息的 `body` 交给 `react-markdown`，`remarkPlugins` 包含 `remark-gfm`。
至少能显示：段落、列表、表格、围栏代码块。
进行中的正文每追加一次就重新渲染；可观察状态仍是进行中。
不得把 Markdown 渲染结果当成新的引用源，也不得补写上游没有返回的引用。

## 视觉 token

Tailwind `@theme` 必须提供下列名称，值不得改成另一套调色板：

| Token | 值 | 用途 |
|-------|-----|------|
| 纸色 | `#f6f1e7` | 页面底 |
| 墨色 | `#1c1915` | 主文字 |
| 弱墨 | `#5c564c` | 次要文字 |
| 线条 | `#e4dccf` | 分割与描边 |
| 强调色 | `#0f6e56` | 可点击的强调 |
| 失败色 | `#9f2d2d` | 失败状态 |
| 正文字体 | Source Serif 4 | 回答正文 |
| 界面字体 | Source Sans 3 | 导航、列表、表单 |
| 宽屏起点 | `1100px` | 三栏对话台 |

六种状态必须同时用文字和外观区分：没有知识库、等待、进行中、完成、失败、没有引用。

## 构建与托管

- `vite.config.ts` 使用 `tanstackStart({ spa: { enabled: true } })`。
- 生产镜像用 nginx 托管静态产物，不运行 Node。
- `location /api/` 反代到 Python，`proxy_buffering off`。
- 其他路径回退到 SPA shell，刷新 `/` 与 `/activity` 不得 404。
- 不要 prerender 需要访问 cookie 的数据页。
