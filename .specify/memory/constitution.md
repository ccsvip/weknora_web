<!--
Sync Impact Report
- Version: 1.0.0 → 1.1.0
- Bump rationale: MINOR。新增第六条，并把集成约束中「前端由实现计划选定」
  加严为宪章锁定的技术栈。第一条到第五条的含义不变，未删除或重定义原则。
- Modified principles:
  - I–V 标题与规则保持不变
  - 新增 VI. 前端技术栈锁定
- Added sections: 无新顶级章节。第六条写入 Core Principles。
- Removed sections: 无。
- Modified constraints:
  - WeKnora Integration Constraints：删除「前端框架与语言由实现计划选定」，
    改为由第六条锁定。
  - Delivery Workflow / Governance：合规范围从第一条到第五条改为第一条到第六条。
- Follow-up TODOs:
  - 产品展示名尚未确定，标题暂用 WeKnora Web。确定名称后做一次 PATCH 修订。
  - 对接的 WeKnora 精确版本不在本宪章锁定。批准时上游 README 标为 v0.9.0，
    每份计划仍必须写明所针对的版本。
  - specs/001-weknora-web-app 的 plan.md、research.md、tasks.md 在本次修订前
    按 React 19 + Vite 静态页面交付，未纳入 TanStack Start、TanStack Router、
    Tailwind CSS v4、Vite 7 与 react-markdown。该功能 MUST 对照第六条重新核对。
-->

# WeKnora Web Constitution

## Core Principles

### I. 知识能力只走 WeKnora

本仓库是 [WeKnora](https://github.com/Tencent/WeKnora) 的网页客户端。
文档解析、分块、索引、检索、智能体执行和回答生成 MUST 通过
WeKnora 已发布的 HTTP API（`/api/v1`）完成。

本仓库 MUST NOT 自行实现上述流水线，MUST NOT 把 WeKnora 服务端代码
复制进本应用，也 MUST NOT 为了回答知识问题直接调用嵌入模型、
向量库或大模型供应商。

**理由**：产品边界是客户端。本地再做一套检索或生成，会导致答案来源分裂，
并与上游行为脱节。

### II. 调用只经统一客户端

所有 WeKnora 请求 MUST 经过单一客户端模块。该模块 MUST 映射文档中的
请求与响应形状，包括成功信封 `{ success, data }` 和失败信封
`{ success: false, error: { code, message, details } }`。

页面、组件和其他功能代码 MUST NOT 直接向 WeKnora 发 HTTP 请求。
知识对话与智能体对话 MUST 按文档消费 SSE
（`knowledge-chat`、`agent-chat`），MUST NOT 把未结束的流当作完整答案展示。

上游契约变化时，适配 MUST 只发生在该客户端模块内，并且 MUST 在同一次变更中
更新对应的契约测试。

**理由**：把协议差异关在一个模块里，界面代码才不会各自猜测字段和错误码。

### III. 共享密钥不出浏览器（不可协商）

共享的 WeKnora API Key、平台 Key、租户 HMAC 密钥和模型供应商凭证
MUST NOT 出现在浏览器包、前端存储、入库的环境文件或日志中。

使用 API Key 的集成 MUST 由本应用的服务端附加 `X-API-Key`。
使用终端用户自己的 JWT 时，浏览器 MAY 只保存该用户自己的令牌，
并且 MUST 用 `X-Tenant-ID` 指向该用户有权访问的工作区。

工作区级 API Key MUST NOT 用于访问另一个租户。
收到 403 或 409 时，调用方 MUST NOT 更换租户后重试。

**理由**：API Key 是机器凭证，泄漏后可以越过界面直接操作知识库。
403 与 409 表示授权或租户上下文错误，换租户重试会扩大访问范围。

### IV. 按能力授权

每个功能 MUST 声明它需要的 WeKnora 能力。能力至少包括
`retrieve`、`ingest`、`chat`、`read_agents`、`manage_agents`、`manage_kbs`，
以及该密钥上的知识库允许列表（如果有）。

界面 MUST 隐藏或禁用当前密钥或角色不能执行的操作。
本应用 MUST NOT 为了绕过缺失的能力去申请更宽的密钥。

会话属于创建它的调用方。本应用 MUST NOT 列出或打开其他用户的会话。
知识库的读和写 MUST 遵守 WeKnora 的所有权与允许列表。

**理由**：WeKnora 的 API Key 默认拒绝未声明的能力。界面若展示做不到的操作，
用户只会得到 403，授权边界也会变得不可检查。

### V. 答案与失败都如实呈现

展示给用户的回答 MUST 来自一次已完成的 WeKnora 知识对话或智能体对话。
API 返回引用时，界面 MUST 展示这些引用。

检索失败、生成失败或流中断时，界面 MUST 呈现可区分的失败状态，
MUST NOT 用本地编造的文字补上答案。

文档入库在 WeKnora 报告该文档可检索之前 MUST 视为未完成。
界面 MUST NOT 在此之前声称文件已经可以搜索。

**理由**：这个应用的价值是可核对的知识回答。把失败伪装成回答，
会让用户无法判断内容是否来自知识库。

### VI. 前端技术栈锁定

界面层 MUST 使用下列技术，MUST NOT 以其他框架或语言替换：

- 页面构建、交互管理与类型检查 MUST 使用 React 19 与 TypeScript。
- 应用框架、页面路由与首次数据加载 MUST 使用 TanStack Start 与
  TanStack Router。
- 布局、颜色、间距与不同屏幕尺寸下的显示 MUST 使用 Tailwind CSS v4。
- 开发时的即时更新与上线打包 MUST 使用 Vite 7。
- 回答中的 Markdown MUST 使用 react-markdown 与 remark-gfm 渲染为表格、
  列表、代码块等可读结构。
- 接收回答时 MUST 使用 Fetch 读取 SSE 流，并按到达顺序把文字逐段写入界面；
  未结束的流 MUST 标为进行中，MUST NOT 当作完整答案。

聊天界面 MUST 由 React 与 Tailwind CSS 呈现。问答能力 MUST 来自 WeKnora API。

TanStack Start 若包含服务端代码，该代码 MUST 遵守第二条与第三条：
WeKnora 请求仍只经统一客户端发出，共享密钥 MUST NOT 进入浏览器包。
页面与组件对回答流的 Fetch MUST 打到本应用的接口，MUST NOT 直连 WeKnora。

**理由**：把界面技术写进宪章，规格和实现不会各自换栈。逐段展示只规定
传输与渲染方式，不改变「答案只来自 WeKnora」。

## WeKnora Integration Constraints

- 上游是可配置基址上的 WeKnora HTTP API。本宪章不锁定补丁版本。
  批准时上游发布线为 v0.9.0。每份实现计划 MUST 写明它针对的 WeKnora 版本。
- 每份规格 MUST 写明认证方式：服务端持有的 API Key，或用户 JWT 加 `X-Tenant-ID`。
- 知识路径上的嵌入、向量库和大模型访问由 WeKnora 完成。本应用不配置这些供应商。
- 交付物是网页。原生客户端、即时通讯频道机器人，以及对 WeKnora 服务端的修改，
  不在范围内，除非后续修订明确纳入。
- 前端技术栈由第六条锁定。实现计划 MUST 使用该栈，并 MUST 满足第一条到第六条。

## Delivery Workflow

- 功能顺序固定为：规格、澄清、计划、任务、实现。规格被接受之前 MUST NOT 写功能代码。
- 一个功能用到的每组 WeKnora 端点 MUST 有契约测试，覆盖成功信封、失败信封，
  以及 SSE 流的正常结束和中断。
- 改动对话、入库或租户选择的变更 MUST 附带自动测试，或在合并说明里记录已执行的手工检查。
  检查 MUST 覆盖：无权租户、流失败、检索为空、文档尚未解析完成。
- 密钥放在服务端环境配置中，MUST NOT 提交进仓库。
- 评审 MUST 对照第一条到第六条。任一违反 MUST 阻止合并。

## Governance

本宪章高于个人习惯和模板示例。规格、计划和任务清单若与本宪章冲突，以本宪章为准。

修订程序：直接修改本文件，按下面的规则提升版本，更新最后修订日期，
并写明哪些已有规格或计划需要重新核对。

版本规则：

- MAJOR：删除或重新定义某条原则，使已有规格不再符合。
- MINOR：新增原则，或实质性加严已有指导。
- PATCH：不改变规则含义的措辞、排版或笔误修正。

合规检查：每份规格、计划和任务清单 MUST 说明它如何满足第一条到第六条。
`/speckit-analyze` 与代码评审以本文件为治理依据。

本次修订后须重新核对：`specs/001-weknora-web-app/` 的 plan.md、research.md
与 tasks.md。该功能在 1.0.0 下按 React 19 与 Vite 静态页面交付，尚未纳入
TanStack Start、TanStack Router、Tailwind CSS v4、Vite 7、react-markdown
与 remark-gfm。未完成重新核对之前，对照第六条的评审 MUST 判定该计划不合规。

运行时开发指导以 `specs/` 下的功能规格为准。首份规格出现之前，本宪章是唯一的治理文档。

**Version**: 1.1.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
