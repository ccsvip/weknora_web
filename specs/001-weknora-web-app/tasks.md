# Tasks: WeKnora 网页对话台

**Input**: Design documents from `/specs/001-weknora-web-app/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: 本功能包含测试。宪章要求每个用到的 WeKnora 端点组都有契约测试；plan.md 要求 pytest 假上游和六种界面状态的 Vitest。先写测试并确认失败，再写实现。

**Organization**: 任务按用户故事分组，使每个故事可以独立实现和验收。访问口令、登录页和退出放在 Foundational，因此用户故事 1 的检查点可以先登录再提问。安全启动阶段只保留网页容器的端口替换。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件，且不依赖尚未完成的任务）
- **[Story]**: 任务所属用户故事（US1、US2、US3、US4）
- 描述中给出确切文件路径

## Path Conventions

- 网页应用：`backend/src/weknora_web/`、`backend/tests/`、`frontend/src/`、`frontend/tests/`
- 启动文件在仓库根目录：`compose.yaml`、`.env.example`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 建立计划里的目录、依赖和容器入口

- [X] T001 按 plan.md 创建目录 `backend/src/weknora_web/api/`、`backend/src/weknora_web/auth/`、`backend/src/weknora_web/models/`、`backend/src/weknora_web/services/`、`backend/src/weknora_web/weknora/`、`backend/tests/contract/`、`backend/tests/integration/`、`backend/tests/unit/`、`backend/alembic/versions/`、`frontend/src/components/`、`frontend/src/pages/`、`frontend/src/services/`、`frontend/src/styles/`、`frontend/tests/`
- [X] T002 在 `backend/pyproject.toml` 声明 Python 3.12、FastAPI、Pydantic v2、Uvicorn、SQLAlchemy 2、Alembic、HTTPX、pytest 和 ruff
- [X] T003 [P] 在 `frontend/package.json`、`frontend/vite.config.ts`、`frontend/tsconfig.json` 配置 React 19、Vite、TypeScript、Vitest 和 Testing Library
- [X] T004 [P] 在 `.env.example` 列出空值的 `WEB_PORT`、`API_PORT`、`POSTGRES_PORT`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`、`WEKNORA_BASE_URL`、`WEKNORA_API_KEY`、`ACCESS_PASSWORD`、`ACCESS_SESSION_SECRET`、`ACCESS_COOKIE_SECURE`，不写真实密钥和端口数字
- [X] T005 [P] 在 `compose.yaml` 定义 web、api、db 三个服务；只发布 `${WEB_PORT}`；`PGPORT` 与数据库连接使用 `${POSTGRES_PORT}`；api 使用 `${API_PORT}`；文件中不出现端口数字
- [X] T006 [P] 在 `backend/Dockerfile` 中先执行 Alembic 升级，再用环境变量 `API_PORT` 启动 Uvicorn，不写默认端口
- [X] T007 [P] 在 `frontend/Dockerfile` 与 `frontend/nginx.conf.template` 中让网页容器监听 `${WEB_PORT}`，把 `/api` 反代到 api，并对该路径设置 `proxy_buffering off`
- [X] T008 [P] 在 `frontend/eslint.config.js` 启用 TypeScript 与 React 检查

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事共用的配置、数据库、错误信封、上游传输，以及进入提问前必须可用的访问会话

**⚠️ CRITICAL**: 本阶段完成前，不得开始任何用户故事

- [X] T009 在 `backend/src/weknora_web/settings.py` 读取环境变量并去掉首尾空白；`ACCESS_PASSWORD`、`WEKNORA_API_KEY`、`ACCESS_SESSION_SECRET`、`DATABASE_URL`、`API_PORT` 任一为空时返回缺失名称。不提供端口或密钥默认值，不在日志中打印这些值
- [X] T010 [P] 在 `backend/src/weknora_web/db.py` 用 `DATABASE_URL` 创建 SQLAlchemy 2 引擎和会话工厂
- [X] T011 [P] 在 `backend/alembic.ini` 与 `backend/alembic/env.py` 把迁移接到 `DATABASE_URL` 和模型元数据，不把连接串写死
- [X] T012 在 `backend/src/weknora_web/api/errors.py` 实现 `{ "error": { "code", "message" } }`，code 只使用 `access_required`、`access_denied`、`validation_error`、`conversation_not_found`、`conversation_busy`、`conversation_not_continuable`、`upstream_forbidden`、`upstream_conflict`、`upstream_failed`、`upstream_unavailable`、`delete_failed`
- [X] T013 在 `backend/src/weknora_web/main.py` 创建 FastAPI 应用、挂载错误处理，并提供不含业务数据的 `GET /api/v1/health`
- [X] T014 [P] 在 `backend/src/weknora_web/weknora/client.py` 实现唯一的上游传输：每个请求只加 `X-API-Key`，不发送 `X-Tenant-ID` 或 `Authorization`；HTTP 403 与 409 只尝试一次。用注释说明为什么不能换租户重试

### Tests for access startup

> **NOTE: 先写这些测试，确认失败后再实现 T017–T022**

- [X] T015 [P] 在 `backend/tests/unit/test_settings_exit.py` 断言 `ACCESS_PASSWORD`、`WEKNORA_API_KEY`、`ACCESS_SESSION_SECRET` 未填写或只有空白时，进程在监听前以非零状态退出，日志只含配置名
- [X] T016 [P] 在 `backend/tests/integration/test_access_session.py` 覆盖错误口令返回 `access_denied`、正确口令设置无过期时间的 `weknora_web_access`、刷新后仍通过、主动退出后必须重新登录、服务端重新创建应用对象后原 cookie 仍有效

### Implementation for access startup

- [X] T017 在 `backend/src/weknora_web/auth/session.py` 签发和校验 cookie `weknora_web_access`：`HttpOnly`、`SameSite=Lax`、`Path=/`，不设置 `Max-Age` 或 `Expires`；仅当 `ACCESS_COOKIE_SECURE=true` 时加 `Secure`。cookie 值是签名时间戳，不含口令。用注释说明为什么不设过期时间
- [X] T018 在 `backend/src/weknora_web/auth/deps.py` 提供访问会话依赖。知识库、对话、消息和活动记录路由都必须使用它。`GET /api/v1/health` 与 `POST /api/v1/access-sessions` 除外。cookie 无效或缺失时返回 `access_required`
- [X] T019 在 `backend/src/weknora_web/api/access.py` 实现 `POST /api/v1/access-sessions` 与 `DELETE /api/v1/access-sessions/current`；响应和日志都不得回传口令
- [X] T020 在 `backend/src/weknora_web/main.py` 于开始监听之前调用 `backend/src/weknora_web/settings.py`，缺失项时 `sys.exit`，并挂载访问会话路由
- [X] T021 [P] 在 `frontend/src/pages/LoginPage.tsx` 提交口令；错误时留在登录页，成功后进入对话页
- [X] T022 在 `frontend/src/components/LogoutButton.tsx` 调用删除当前访问会话，并在 `frontend/src/App.tsx` 中于未通过口令时只显示 `frontend/src/pages/LoginPage.tsx`
- [X] T023 [P] 在 `frontend/src/styles/tokens.css` 定义纸色 `#f6f1e7`、墨色 `#1c1915`、弱墨 `#5c564c`、线条 `#e4dccf`、强调色 `#0f6e56`、失败色 `#9f2d2d`，以及回答用的 Source Serif 4 和界面用的 Source Sans 3
- [X] T024 [P] 在 `frontend/src/services/api.ts` 只请求同源 `/api/v1`，不出现 WeKnora 基址或 API Key
- [X] T025 在 `frontend/index.html` 与 `frontend/src/main.tsx` 加载上述字体和 `frontend/src/styles/tokens.css`，并挂载 `frontend/src/App.tsx`。保留 T022 写入的登录门：未通过口令时只显示 `frontend/src/pages/LoginPage.tsx`

**Checkpoint**: 健康检查可用；口令、上游密钥或会话签名缺失时进程在监听前退出；未登录请求被拒绝；同一浏览器在主动退出前保持通过；上游传输不换租户重试

---

## Phase 3: User Story 1 - 向知识库提问 (Priority: P1) 🎯 MVP

**Goal**: 已登录的操作者选择一个允许使用的知识库，提交问题，看到逐步出现的回答、引用或“没有引用”，以及可区分的进行中、完成和失败状态

**Independent Test**: 用访问口令进入后，在已配置且至少有一个可用知识库的产品上，选择知识库、提交非空问题，并核对回答、引用和失败画面。不依赖对话列表或活动记录页面

### Tests for User Story 1

> **NOTE: 先写这些测试，确认失败后再实现**

- [X] T026 [P] [US1] 在 `backend/tests/contract/test_weknora_client.py` 用假上游覆盖 `contracts/weknora-v0.9.0.md`：成功信封 `{ success, data }`；失败信封 `{ success: false, error: { code, message, details } }`；成功与空的知识库列表、创建会话、只累加 `response_type == "answer"` 的 `content`、`thinking` 不进正文、`knowledge_references` 成为引用、`complete` 结束、完成前断开视为中断、空引用不产生引用、403 与 409 只收到一次请求、继续提问的 `query` 只有新问题且 `knowledge_base_ids` 只有一个 id
- [X] T027 [P] [US1] 在 `backend/tests/integration/test_ask.py` 覆盖空白问题被拒绝、超过 8,000 个字符被拒绝、回答未结束时第二次提交返回 `conversation_busy`、流式事件顺序为 `message` / 可选 `references` / `done`、上游失败时状态为 `interrupted` 且不生成本地编造正文
- [X] T028 [P] [US1] 在 `frontend/tests/conversation-states.test.tsx` 断言六个状态能靠文字区分：没有知识库、等待、进行中、完成、失败、没有引用

### Implementation for User Story 1

- [X] T029 [P] [US1] 在 `backend/src/weknora_web/models/conversation.py` 建立 Conversation：`weknora_session_id` 文本可空且唯一，上游会话确认消失后清空；`knowledge_base_id` 文本必填且创建后不变；`knowledge_base_name` 文本必填，创建时取上游名称，之后不因为上游改名而回写；`title` 必填；`continuable` 新建为真，变为假后不能改回真
- [X] T030 [P] [US1] 在 `backend/src/weknora_web/models/message.py` 建立 Message：`role` 只能是 `user` 或 `assistant`；`status` 只能是 `complete`、`streaming`、`interrupted`；用户消息创建后即为 `complete`；助手消息创建时为 `streaming`
- [X] T031 [P] [US1] 在 `backend/src/weknora_web/models/citation.py` 建立 Citation：只属于 `assistant` 消息；`title` 来自 `knowledge_title`，上游为空时存“未命名引用”；`excerpt` 来自 `content`，最多保存前 500 个字符；`position` 从 0 起；同一助手消息内以 `knowledge_id` 加 `excerpt` 去重
- [X] T032 [P] [US1] 在 `backend/src/weknora_web/models/activity.py` 建立 ActivityRecord：`conversation_id` 必填但不做外键；`kind` 只能是 `conversation_created`、`message_completed`、`message_failed`、`conversation_deleted`；`summary` 不得包含访问口令、上游密钥、会话签名或消息正文；写入后不提供修改
- [X] T033 [US1] 在 `backend/alembic/versions/001_chat_records.py` 为 Conversation、Message、Citation、ActivityRecord 生成初始迁移
- [X] T034 [US1] 在 `backend/src/weknora_web/weknora/client.py` 增加列出知识库、`POST /api/v1/sessions`（请求体只有 `title`，不发送 `kind` 或 `assistant`）和 `POST /api/v1/knowledge-chat/{session_id}` 的解析，规则与 T026 的契约一致，包括成功信封和失败信封
- [X] T035 [US1] 在 `backend/src/weknora_web/services/chat.py` 实现创建对话和提交问题：问题去掉首尾空白后为空则拒绝且不产生消息；问题字符数大于 8,000 则拒绝，按提交原文计数；存在 `streaming` 助手消息时拒绝新问题；`continuable` 为假时拒绝新问题但已有消息仍可读取；第一条非空问题把 `title` 改为去掉首尾空白后的前 40 个字符，此前标题等于知识库名称；只把新问题作为 `query`；助手消息在完成事件且没有错误时变为 `complete`，在上游错误、完成前断开或 403/409/其他失败时变为 `interrupted` 并保留已收到的 `answer` 文本；`complete` 与 `interrupted` 不能回到 `streaming`；引用只在该消息结束时写入一次；成功创建对话写 `conversation_created`，完成写 `message_completed`，中断写 `message_failed`。不另设更新接口：标题只在提交这第一条消息时写入，助手状态只在这次流式响应里改变，活动记录写入后不再修改
- [X] T036 [US1] 在 `backend/src/weknora_web/api/knowledge_bases.py` 实现 `GET /api/v1/knowledge-bases`，并使用 `backend/src/weknora_web/auth/deps.py`。用 `reason` 区分 `none`、`no_knowledge_bases`、`missing_capability`、`upstream_forbidden`、`upstream_unreachable`，不伪造知识库
- [X] T037 [US1] 在 `backend/src/weknora_web/api/messages.py` 实现 `POST /api/v1/conversations/{conversation_id}/messages`，并使用 `backend/src/weknora_web/auth/deps.py`。成功时返回 `text/event-stream`，事件名为 `message`、`references`、`done`、`error`。该响应不做缓冲，以便进行中的回答至少每秒把已收到的正文送到页面
- [X] T038 [US1] 在 `backend/src/weknora_web/main.py` 挂载知识库和消息路由。与 T043 按顺序做，不要并行修改 `backend/src/weknora_web/main.py` 和 `frontend/src/App.tsx`
- [X] T039 [P] [US1] 在 `frontend/src/components/Composer.tsx` 提交非空问题，并在回答进行中禁用再次提交
- [X] T040 [P] [US1] 在 `frontend/src/components/AnswerPane.tsx` 按到达顺序追加 `delta`，使进行中的回答文字持续变化。用不同文字和外观显示等待、进行中、完成、失败；失败时保留已收到正文并标为中断；不把进行中显示成完成
- [X] T041 [P] [US1] 在 `frontend/src/components/CitationRail.tsx` 把引用显示在回答旁边；没有引用时显示“没有引用”，不把引用混进正文
- [X] T042 [US1] 在 `frontend/src/pages/ConversationPage.tsx` 组装知识库选择、Composer、AnswerPane 和 CitationRail。`reason` 为 `no_knowledge_bases` 时显示“没有可访问的知识库”。`reason` 为 `missing_capability` 时用另一句说明当前密钥缺少所需能力，并与上一句可区分。两种情况都禁用提问。视口宽度至少 1100px 时，当前对话、问题输入和引用同时可见
- [X] T043 [US1] 在 `frontend/src/App.tsx` 把已登录后的默认页面指向 `frontend/src/pages/ConversationPage.tsx`，并保留 T022 的登录门

**Checkpoint**: 用户故事 1 可以先登录，再独立提问并看到真实的上游回答或失败

---

## Phase 4: User Story 2 - 管理已保存的对话 (Priority: P2)

**Goal**: 操作者能在重启后找到自己的对话、继续某一段、删除某一段，并在上游删除失败时仍能打开本地对话

**Independent Test**: 连续创建两段对话并重启后，两段都在且消息不串。删除其中一段成功时，本产品和 WeKnora 里都找不到它；上游删除失败时，该对话仍可打开且没有删除事件。种入 100 段对话时，一次列表请求返回这 100 段并在 10 秒内结束

### Tests for User Story 2

- [X] T044 [P] [US2] 在 `backend/tests/integration/test_conversation_management.py` 覆盖列表按 `updated_at` 倒序、消息不串段、重启后记录仍在、删除成功后本地与上游会话都消失、上游删除失败时本地对话仍在且不写 `conversation_deleted`、本地事务失败时 `weknora_session_id` 清空且 `continuable` 为假、知识库不可用或上游会话丢失后旧消息可读但新提问被拒绝。另外种入 100 段对话：默认 `limit` 为 100 的一次列表请求返回这 100 段，并且该请求在 10 秒内结束

### Implementation for User Story 2

- [X] T045 [US2] 在 `backend/src/weknora_web/weknora/client.py` 增加 `DELETE /api/v1/sessions/{id}`；会话标识为空时不调用；失败时调用方不得删除本地对话
- [X] T046 [US2] 在 `backend/src/weknora_web/services/conversation_admin.py` 实现列表、读取和删除：先删 WeKnora 会话，失败则本地 Conversation、Message、Citation 保持原样且不写删除事件；上游成功后再用一个事务删除这三者和插入 `conversation_deleted`；该事务失败时对话仍在，清空 `weknora_session_id`，`continuable` 为假，不写删除事件。删除摘要不含消息正文。不提供更新对话的操作
- [X] T047 [US2] 在 `backend/src/weknora_web/api/conversations.py` 实现 `GET /api/v1/conversations`、`GET /api/v1/conversations/{conversation_id}` 和 `DELETE /api/v1/conversations/{conversation_id}`，并使用 `backend/src/weknora_web/auth/deps.py`；列表 `limit` 默认 100、最大 200。不添加更新对话的路径
- [X] T048 [P] [US2] 在 `frontend/src/components/ConversationList.tsx` 按标题和更新时间区分对话，并提供删除确认
- [X] T049 [US2] 在 `frontend/src/pages/ConversationPage.tsx` 接入列表、继续提问和删除失败后的可打开状态；`continuable` 为假时说明原因并拒绝新提问。视口宽度至少 1100px 时，对话列表、当前对话和引用同时可见

**Checkpoint**: 用户故事 1 和 2 都能独立使用，历史对话不会串段

---

## Phase 5: User Story 4 - 安全启动 (Priority: P2)

**Goal**: 网页容器用环境变量替换监听端口后再启动。改 `WEB_PORT` 只改部署配置。空口令拒绝启动和登录页已在 Foundational 的 T015、T020、T021 完成，本阶段不重复实现

**Independent Test**: 用填好的 `.env` 执行 `docker compose up --build`。把 `WEB_PORT` 改成另一个空闲端口后只重启，新端口上打开的仍是已经能登录的页面，且不需要改源码

### Implementation for User Story 4

- [X] T050 [US4] 在 `frontend/docker-entrypoint.sh` 用环境变量替换 `frontend/nginx.conf.template` 后再启动网页容器，不写入端口数字

**Checkpoint**: 改 `WEB_PORT` 后，网页容器在新端口提供同一套已登录入口

---

## Phase 6: User Story 3 - 查看活动记录 (Priority: P3)

**Goal**: 操作者按时间查看创建、完成、失败和删除事件，并能按对话筛选；删除事件不含消息正文

**Independent Test**: 种入或实际产生创建、完成、失败和删除事件后，只打开活动记录页，按对话筛选能在 5 秒内看到对应事件，删除事件不含正文和密钥

### Tests for User Story 3

- [X] T051 [P] [US3] 在 `backend/tests/integration/test_activity_records.py` 覆盖 `created_at` 倒序、`conversation_id` 筛选、四类 `kind`，以及 `conversation_deleted` 的 `summary` 不含消息正文、访问口令、上游密钥和会话签名
- [X] T052 [P] [US3] 在 `frontend/tests/activity-page.test.tsx` 覆盖按对话筛选后的事件列表，并断言删除事件不显示消息正文

### Implementation for User Story 3

- [X] T053 [US3] 在 `backend/src/weknora_web/api/activity.py` 实现 `GET /api/v1/activity-records`，使用 `backend/src/weknora_web/auth/deps.py`，支持可选 `conversation_id` 和 `limit`（默认 100、最大 200），并在 `backend/src/weknora_web/main.py` 挂载。活动记录只有读取，没有更新路径
- [X] T054 [US3] 在 `frontend/src/pages/ActivityPage.tsx` 按对话筛选并展示时间、标题、类别和摘要
- [X] T055 [US3] 在 `frontend/src/App.tsx` 增加活动记录入口，指向 `frontend/src/pages/ActivityPage.tsx`，并保留登录门和已登录后的默认对话页

**Checkpoint**: 四个用户故事都能独立验收

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 检查跨故事约束，并按 quickstart 做端到端验收

- [X] T056 [P] 在 `backend/tests/contract/test_openapi_routes.py` 断言已实现路由与 `specs/001-weknora-web-app/contracts/openapi.yaml` 一致，且不存在上传、智能体、直连模型或更新对话、消息、活动记录的路径
- [X] T057 [P] 在 `scripts/check-config-hygiene.ps1` 检查 `backend/src/`、`frontend/src/`、`compose.yaml` 和 `.env.example` 没有真实密钥，也没有写死的产品监听端口
- [X] T058 核对 `backend/src/weknora_web/weknora/client.py`、`backend/src/weknora_web/services/chat.py`、`backend/src/weknora_web/services/conversation_admin.py` 和 `backend/src/weknora_web/auth/session.py` 中的非显而易见逻辑都有说明原因的注释
- [X] T059 按 `specs/001-weknora-web-app/quickstart.md` 执行启动、口令、提问、重启、删除和视觉状态验收，其中包括回答进行期间画面文字至少每秒变化一次，以及 100 段对话的一次列表请求在 10 秒内结束

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无前置，可立即开始
- **Foundational (Phase 2)**: 依赖 Setup；阻断全部用户故事。其中 T015 与 T016 先写并先失败，再做 T017–T022
- **User Stories (Phase 3+)**: 都依赖 Foundational。用户故事 1 开始时，登录页和访问会话已经可用
- **Polish (Phase 7)**: 依赖要交付的用户故事都已完成

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 完成后即可开始，不依赖其他故事。T038 与 T043 按顺序做
- **User Story 2 (P2)**: 依赖 User Story 1 的 Conversation、Message、Citation 模型和服务
- **User Story 4 (P2)**: 只依赖 T007 的网页容器模板。空口令退出和登录不在本阶段。它不再修改 `backend/src/weknora_web/main.py` 或 `frontend/src/App.tsx`
- **User Story 3 (P3)**: 读取 User Story 1 和 User Story 2 写下的活动记录。接口本身可以用种入的行独立测试。T053 与 T055 在 User Story 1 改完 `main.py` 和 `App.tsx` 之后进行

### Within Each User Story

- 测试先写，并先失败
- 模型先于服务
- 服务先于路由
- 页面组装放在对应组件之后

### Parallel Opportunities

- T003–T008 可并行
- T010、T011、T014 可并行；T015 与 T016 可并行；T021、T023、T024 可并行
- T015 与 T016 失败后，再做 T017、T019 和 T021。T022 与 T025 都改 `frontend/src/App.tsx`，按编号顺序做
- 每个故事内标记 [P] 的测试可并行
- T029–T032 可并行；T039–T041 可并行
- T038 与 T043 不要并行

---

## Parallel Example: Foundational

```text
T015 backend/tests/unit/test_settings_exit.py
T016 backend/tests/integration/test_access_session.py
```

上述测试失败后，再做 `backend/src/weknora_web/auth/session.py` 和 `frontend/src/pages/LoginPage.tsx`。

## Parallel Example: User Story 1

```text
T026 backend/tests/contract/test_weknora_client.py
T027 backend/tests/integration/test_ask.py
T028 frontend/tests/conversation-states.test.tsx

T029 backend/src/weknora_web/models/conversation.py
T030 backend/src/weknora_web/models/message.py
T031 backend/src/weknora_web/models/citation.py
T032 backend/src/weknora_web/models/activity.py

T039 frontend/src/components/Composer.tsx
T040 frontend/src/components/AnswerPane.tsx
T041 frontend/src/components/CitationRail.tsx
```

## Parallel Example: User Story 2

```text
T044 backend/tests/integration/test_conversation_management.py
```

T044 失败后，再做 `frontend/src/components/ConversationList.tsx`。

## Parallel Example: User Story 3

```text
T051 backend/tests/integration/test_activity_records.py
T052 frontend/tests/activity-page.test.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational，包括登录、退出和缺失口令时在监听前退出
3. 完成 Phase 3: User Story 1
4. **STOP and VALIDATE**: 独立运行 T026–T028，登录后手工完成一次提问
5. 提问路径可用后再继续其他故事

### Incremental Delivery

1. Setup + Foundational 完成后，操作者已经能登录
2. User Story 1 交付可核对的知识对话
3. User Story 2 交付历史、继续和删除
4. User Story 4 交付网页容器按 `WEB_PORT` 启动
5. User Story 3 交付活动记录筛选
6. Polish 按 quickstart 做总验收

### Parallel Team Strategy

1. 一起完成 Setup 和 Foundational
2. 之后一人做 User Story 1 的后端，另一人做 User Story 1 的界面组件
3. User Story 1 合并后，再做 User Story 2 和 User Story 3
4. 不要让两个人同时修改 `backend/src/weknora_web/main.py` 或 `frontend/src/App.tsx`

---

## Notes

- [P] 表示不同文件、且不依赖本阶段尚未完成的任务
- Setup、Foundational 和 Polish 的任务不带故事标签
- 故事阶段的任务都带 [US1]、[US2]、[US3] 或 [US4]
- 每个故事都可以在自己的检查点单独验收
- 先确认新测试失败，再写实现
- 停在任一检查点都可以演示已经完成的故事
- 本功能没有文档上传，因此没有“文档尚未解析完成”这条路径

## Constitution Compliance

本任务清单对应 Constitution 1.0.0。

- **原则 I**：T014、T034、T035 只通过 WeKnora 知识对话产生回答。T056 确认不存在上传、智能体或直连模型的路径。
- **原则 II**：T014 与 T034 是唯一的上游客户端。T026 覆盖成功信封、失败信封，以及 SSE 的正常结束和中断。页面只经 T024 调用本产品的 `/api/v1`。
- **原则 III**：T004、T015、T019 把访问口令和上游密钥留在服务端配置。cookie 不含口令。T057 扫描源码和示例配置。
- **原则 IV**：T014 不发送 `X-Tenant-ID`，403 与 409 只请求一次。T026 断言这个次数。T036 与 T042 在缺少能力时禁用提问并另行说明。本功能没有上传，因此没有“文档尚未解析完成”的任务。
- **原则 V**：T026、T035、T040、T041 只展示上游回答正文和引用。失败与中断保持可区分，不编造正文。

## Phase 8: Convergence

**Purpose**: 补齐宪章 1.1.0 第六条与修订后计划要求的界面栈、路由、视觉、Markdown 和测试。不改已有任务编号。

- [X] T060 CRITICAL 在 `frontend/package.json`、`frontend/vite.config.ts`、`frontend/tsconfig.json` 与 `frontend/Dockerfile` 接入 Vite 7、TanStack Start SPA（`tanstackStart({ spa: { enabled: true } })`）、TanStack Router、Tailwind CSS v4（`@tailwindcss/vite`）、react-markdown 与 remark-gfm；React 插件排在 Start 之后；不启用 Start server functions、API routes 或 Nitro；构建阶段使用 Node 22.12+，运行时仍为 nginx per Constitution VI (missing)
- [X] T061 CRITICAL 用 `frontend/src/routes/` 文件路由替换 `frontend/src/App.tsx` 的本地页面状态：`/login`、`/`、`/activity`；已登录布局用 `beforeLoad` 在 `access_required` 时重定向到 `/login`；`/` 与 `/activity` 的 loader 只请求同源 `/api/v1`；`frontend/nginx.conf.template` 的非 `/api` 回退到 SPA shell；刷新 `/` 与 `/activity` 不得 404 per Constitution VI (contradicts)
- [X] T062 把纸色编辑台落到 Tailwind `@theme` 与对话台布局：token 为纸色 `#f6f1e7`、墨色 `#1c1915`、弱墨 `#5c564c`、线条 `#e4dccf`、强调色 `#0f6e56`、失败色 `#9f2d2d`、Source Serif 4 / Source Sans 3；视口 ≥1100px 时 `frontend/src/pages/ConversationPage.tsx`（或对应路由组件）同时显示对话列表、当前对话和 `frontend/src/components/CitationRail.tsx` 旁注，引用不得只做回答下的 chips；去掉 `frontend/src/styles/tokens.css` 中白底黑字的 `.chat*` 通用聊天壳 per T023 (contradicts)
- [X] T063 在 `frontend/src/components/AnswerPane.tsx` 用 react-markdown 与 remark-gfm 渲染助手正文（表格、列表、围栏代码块）；流式追加时重新渲染且 `data-state` 保持进行中，不得把未结束的流标为完成 per Constitution VI (missing)
- [X] T064 在 `frontend/tests/` 增加页面测试：Markdown 表格/列表/代码块；进行中不得显示为完成；未登录打开 `/` 或 `/activity` 进入 `/login` per plan: testing (missing)
- [X] T065 把 `frontend/vite.config.ts` 的开发代理 `/api` 目标从 `WEB_PORT` 改为 `API_PORT` 上的 Python 服务端，并给流式读取足够的超时 per plan: Vite proxy (contradicts)
