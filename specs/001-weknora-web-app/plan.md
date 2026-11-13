# Implementation Plan: WeKnora 网页对话台

**Branch**: `001-weknora-web-app` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-weknora-web-app/spec.md`

## Summary

做一个单操作者的网页，用来对已有 WeKnora 知识库提问，并把对话、消息、引用和活动记录留在本产品里。浏览器只访问本产品。Python 服务端持有工作区 API Key，通过唯一客户端调用 WeKnora v0.9.0 的知识库列表、会话、知识对话流和删除会话。页面用 React 呈现纸色编辑台：宽屏下列表、对话和引用同时可见。Docker Compose 一条命令启动网页、服务端和 PostgreSQL。端口和密钥只来自 `.env`。

## Technical Context

**Language/Version**: Python 3.12；页面为 TypeScript，React 19，构建工具 Vite。生产网页容器只托管静态文件。

**Primary Dependencies**: FastAPI、Pydantic v2、Uvicorn、SQLAlchemy 2、Alembic、HTTPX。页面测试用 Vitest 与 Testing Library。服务端测试用 pytest。

**Storage**: PostgreSQL 16。不保存知识库正文、切片或向量。

**Testing**: pytest 契约测试使用假 WeKnora。页面组件测试覆盖六种状态。端到端步骤写在 [quickstart.md](quickstart.md)，不把真实 WeKnora 列为自动化前提。

**Target Platform**: Docker Compose 启动的 Linux 容器。操作者用现代桌面浏览器打开网页容器发布的端口。

**Project Type**: 带独立服务端的网页应用。

**Performance Goals**: 回答进行时，页面至少每秒呈现一次新收到的正文。100 段对话的列表一次取回，操作者能在 10 秒内按标题打开目标。活动记录筛选在 5 秒内可见。首次任务（口令、选库、提问、看引用或“没有引用”）在 3 分钟内完成。

**Constraints**: 服务端只能是 Python。上游锁定 WeKnora v0.9.0，只发 `X-API-Key`。访问口令用无过期时间的签名 cookie，重启产品不使其失效。空的口令、上游密钥或签名密钥使进程在监听前退出。源码和 compose 文件不含端口数字和真实密钥。非显而易见的逻辑要有说明原因的注释，包括 403 不重试、先删上游、以及 cookie 不设过期时间。资源式接口见 [contracts/openapi.yaml](contracts/openapi.yaml)。

**Scale/Scope**: 一名操作者，一次部署，一套工作区密钥。验收数据量为 100 段对话、每段最多 50 条消息。不做注册、文档上传、智能体、Wiki 或多用户。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research

| 原则 | 门禁 | 结果 | 证据 |
|------|------|------|------|
| I. 知识能力只走 WeKnora | 回答不得来自本地检索或直接的模型调用 | PASS | 只计划四个上游接口，见 research 第 4 节 |
| II. 调用只经统一客户端 | 页面不得请求 WeKnora；信封和 SSE 只在一个模块解析 | PASS | 客户端契约单独成文，页面只走 `/api/v1` |
| III. 共享密钥不出浏览器 | 工作区 API Key 只在服务端配置；不用用户 JWT | PASS | cookie 只代表本产品访问会话，不含上游密钥 |
| IV. 按能力授权 | 声明 `retrieve` 与 `chat`；403/409 不换租户；不读取他人的上游会话 | PASS | 不发送 `X-Tenant-ID`；只删除本产品创建的会话 |
| V. 答案与失败都如实呈现 | 引用来自上游；失败和中断不得变成完成答案 | PASS | 只累加 `answer`；空引用显式显示；无上传路径 |
| 版本与认证 | 计划写明 WeKnora 版本和认证方式 | PASS | v0.9.0，服务端持有的工作区 API Key |
| 交付约束 | Docker、`.env`、自有数据库、界面框架、资源式接口、注释 | PASS | Technical Context 与 research 第 1–3、7 节 |

无宪章违规。Complexity Tracking 不填写。

### Post-design

Phase 1 的数据模型、OpenAPI 和上游契约复核后，上述门禁仍为 PASS。

- [data-model.md](data-model.md) 不保存知识正文，删除事务避免“只删本地”。
- [contracts/openapi.yaml](contracts/openapi.yaml) 没有上传、智能体或直连模型的路径。创建消息是对话下的消息资源，不是动作式 `/ask`。
- [contracts/weknora-v0.9.0.md](contracts/weknora-v0.9.0.md) 把 403、409、SSE 中断和空引用写成可计数的契约测试。
- 本功能没有文档上传，因此“未解析完成不得称为可搜索”没有对应路径。OpenAPI 不提供文件或入库资源。

## Project Structure

### Documentation (this feature)

```text
specs/001-weknora-web-app/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── weknora-v0.9.0.md
└── tasks.md             # 由 /speckit-tasks 生成，本命令不创建
```

### Source Code (repository root)

```text
compose.yaml
.env.example
backend/
├── Dockerfile
├── pyproject.toml
├── src/
│   └── weknora_web/
│       ├── main.py
│       ├── api/
│       ├── auth/
│       ├── models/
│       ├── services/
│       └── weknora/
└── tests/
    ├── contract/
    ├── integration/
    └── unit/
frontend/
├── Dockerfile
├── package.json
├── src/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── styles/
└── tests/
```

**Structure Decision**: 采用独立的 `backend/` 与 `frontend/`。仓库根目录的 `compose.yaml` 是唯一启动入口，因此操作者不用进入子目录。`backend/src/weknora_web/weknora/` 是唯一允许出现 WeKnora 基址和 API Key 的代码包。`frontend/src/services/` 只能请求同源的 `/api/v1`。网页容器反代 `/api` 并关闭该路径缓冲，使流式回答能够按秒更新。

## Complexity Tracking

无宪章违规，不填写本表。
