# AI Manager for Codex & Claude

AI 任务编排平台 — 以对话方式启动，Claude 主代理与你讨论需求后，**仅在用户明确确认时才拆解执行**。子任务分发给 Codex CLI 和 Claude API 并行执行，前端实时展示泳道式进度。

## 架构

```
用户 → 聊天界面 (ChatFirst) → POST /api/tasks (chat-first)
                                    ↓
                              主代理对话 (chatFirstPhase)
                              ↓ 用户点「开始任务」或发确认关键词
                              Orchestrator (编排引擎)
                              ├── Decomposer (Claude Opus 拆解，60s 超时)
                              ├── Executors (并行执行)
                              │   ├── Claude API (分析/设计/研究)
                              │   └── Codex CLI (编码/集成, --cd 指定目录)
                              └── Aggregator (结果聚合)
                                    ↓
                              主代理在聊天中流式汇报结果
                                    ↓
                              用户反馈 → 继续讨论（不自动拆解）
                                    ↓
                              用户再次确认 → 重新拆解执行 (循环)
```

## 交互流程

```
首页聊天 ──→ 讨论需求 ──→ 点击「开始任务」或发确认关键词 ──→ 拆解 + 执行 ──→ 代理汇报 ──→ 反馈循环
    ↑                                                                                │
    └────────────────────────────────────────────────────────────────────────────────┘
```

1. 打开首页直接进入聊天界面，支持：
   - 文本输入 + **粘贴图片/文件**
   - **拖拽文件上传**、文件选择器、移动端拍照
   - 图片灯箱预览（Esc 关闭、焦点陷阱）
2. 与 AI 主代理讨论项目需求（可**指定项目文件夹**用于 Codex 执行）
3. 需求明确后 **点击「开始任务」或输入确认关键词**（"开始执行"/"开始拆解"/"开始吧"/"execute"等），AI 才拆解执行
4. 执行进度以流水线 + 子任务面板形式在右侧执行面板中展示
5. 完成后 AI 在聊天中流式汇报结果
6. 用户可继续对话反馈，但**系统不会自动重新拆解**——必须再次确认

## 项目结构

```
ai_manager/
├── shared/          # 前后端共享 Zod 类型定义
│   └── src/schemas/ # Subtask, TaskDecomposition, FileAttachment, SSEEvent
├── server/          # Express + TypeScript 后端
│   └── src/
│       ├── routes/
│       │   ├── tasks.ts         # REST API 路由
│       │   └── uploads.ts       # 文件上传（魔数检测、路径遍历防护、分层大小限制）
│       ├── services/
│       │   ├── orchestrator.ts    # 编排引擎 (状态机 + DAG 并行 + 重试 + 流式超时保护)
│       │   ├── decomposer.ts      # Claude 任务拆解 (含输出归一化 + 60s 超时)
│       │   ├── executor-claude.ts # Claude API 流式执行器
│       │   ├── executor-codex.ts  # Codex CLI 子进程执行器 (JSON mode)
│       │   └── aggregator.ts      # 结果聚合
│       ├── sse/manager.ts         # SSE 连接管理 + 断线重播
│       ├── store/
│       │   ├── session-store.ts   # 会话存储 (内存 + 文件持久化 + 原子状态转换)
│       │   └── attachment-store.ts # 附件生命周期管理 + 孤儿清理
│       └── utils/                 # 重试 / 超时 / 日志 / 成本追踪
├── web/             # React 19 + Vite + Tailwind CSS 4 前端
│   └── src/
│       ├── pages/
│       │   ├── ChatFirst.tsx       # 聊天优先首页 (默认，桌面端固定高度 + 右面板)
│       │   ├── TaskSubmit.tsx      # 传统表单提交 (/submit)
│       │   └── TaskProgress.tsx   # 任务进度 + 对话侧边栏
│       ├── components/
│       │   ├── pipeline/   # SwimLane / PipelineView / SubtaskList / LogDrawer
│       │   ├── chat/       # ChatPanel / ChatMessage / ChatInput / ChatMessageList / WorkspaceSelector / FilePreview
│       │   ├── task/       # TaskForm / DecompositionReview
│       │   ├── stats/      # CostPanel / TimePanel
│       │   └── common/     # StatusBadge
│       ├── hooks/useSSE.ts # SSE 连接 + 断线重连 + 流式清理
│       ├── store/          # Zustand 状态管理 (pipeline / session / upload / theme)
│       ├── api/
│       │   ├── client.ts   # REST API 客户端
│       │   └── upload.ts   # 文件上传客户端（可重试 + 指数退避 + AbortController）
│       └── i18n.ts         # 中英文翻译
└── tsconfig.base.json
```

## 功能

### 核心引擎

- **确认门控**: AI 不会自动拆解——必须点击「开始任务」或发确认关键词（"开始执行" / "execute" 等）
- **流式超时保护**: 20s 空闲超时 + 60s 总超时，部分响应也会投递，不会让用户干等
- **智能拆解**: Claude Opus 4.8 分析任务，JSON Schema 结构化输出子任务，内置 LLM 输出归一化 + 60s 超时
- **并行执行**: DAG 依赖解析，最大 5 并发，Claude API + Codex CLI 双引擎，失败自动重试（最多 3 次）
- **Codex 回退**: Codex CLI 不可用时自动回退到 Claude API

### 文件与图片

- **文件上传**: 支持图片/PDF/文本/代码文件，粘贴、拖拽、文件选择器三种方式
- **图片预览**: 上传即预览、灯箱放大（Esc 关闭、焦点陷阱）、移动端拍照上传
- **文件链接**: AI 输出中的文件路径自动渲染为可点击超链接
- **Markdown 图片**: AI 回复中的 `![alt](path)` 语法自动渲染为内联图片
- **安全**: 魔数检测（file-type）替代信任 MIME、分层大小限制、路径遍历防护、上传专用限流

### UI/UX

- **桌面端布局**: `max-w-5xl` 居中，左侧聊天面板 + 右侧 344px 可折叠执行面板，固定高度独立滚动
- **移动端**: 单列全宽，执行面板为底部上滑抽屉，sticky 输入区带 safe-area
- **暗色主题**: CSS 变量体系 (`--chat-bg` / `--panel-bg` / `--accent` 等)，紫色强调色
- **动画**: Framer Motion 消息入场 + 灯箱过渡，尊重 `prefers-reduced-motion`
- **可访问性**: ARIA 角色标注 (`role="status"` / `aria-live`)、键盘导航、焦点陷阱

### 工程

- **附件生命周期**: 独立状态机 (`uploading → ready`)，消息通过 `attachmentIds` 引用，24h 孤儿清理
- **上传队列**: Zustand store 管理，可暂存（无 session 时）、可重试、可取消
- **SSE 重连**: 指数退避（最多 10 次），事件历史重播，心跳保持
- **原子状态转换**: `tryTransitionStatus` CAS 防并发
- **生产保障**: 限流（上传端点独立限制）、pino 日志、优雅关闭、AbortSignal 传播

## 快速开始

```bash
# 1. 配置环境变量
cp .env.example .env
# 无需 API Key — 复用 CCSwitch 代理

# 2. 启动
npm run dev

# 3. 浏览器访问
# http://localhost:5173 (聊天优先首页)
# http://localhost:5173/submit (传统表单)
```

## 命令

```bash
npm run dev          # 启动开发服务器 (server:3001 + web:5173)
npm test             # 运行全部 24 项测试 (7 server + 17 web)
npm run test:server  # 仅运行服务端测试
npm run test:web     # 仅运行前端测试
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | 提交任务（支持 `chat-first` / `auto` / `semi-auto` 模式 + `workspaceDir` + `deferInitialMessage`） |
| GET | `/api/tasks/:id` | 查询任务状态 + 对话历史 + 附件 + 成本统计 + 工作目录 |
| POST | `/api/tasks/:id/approve` | 半自动模式确认拆解 |
| POST | `/api/tasks/:id/cancel` | 取消任务（终止进程） |
| POST | `/api/sessions/:id/message` | 发送跟进消息（可带 attachmentIds） |
| POST | `/api/sessions/:id/reconstruct` | 重新规划未完成的子任务 |
| POST | `/api/sessions/:id/confirm` | 确认需求，触发拆解执行（聊天优先唯一入口） |
| POST | `/api/sessions/:id/workspace` | 更新项目工作目录 |
| POST | `/api/uploads` | 上传文件（multipart，10MB 限制，Magic Number 检测） |
| GET | `/api/uploads/:storageKey` | 获取已上传文件 |
| GET | `/api/sessions/:id/stream` | SSE 实时进度流 |

## 任务生命周期

```
CHATTING ──→ (用户确认) ──→ DECOMPOSING ──→ EXECUTING ──→ AGGREGATING ──→ COMPLETED
    ↑                                                                           │
    └── 用户发消息 (回到 chatting，继续对话) ←───────────────────────────────────┘
```

子任务状态: `pending → queued → running → completed / failed / timed_out / cancelled`

## SSE 事件类型

| 事件 | 说明 |
|------|------|
| `session:created` | 会话已创建 |
| `stage:started` / `stage:completed` | 阶段状态变更 |
| `stage:awaiting_review` | 半自动模式等待审核 |
| `subtask:started` / `subtask:queued` / `subtask:progress` / `subtask:completed` / `subtask:failed` / `subtask:timed_out` | 子任务状态流 |
| `message:chunk` | AI 对话流式输出片段 |
| `message:complete` | AI 对话消息完成（含 role、timestamp、可选 attachmentIds） |
| `attachment:updated` | 附件状态更新 |
| `session:complete` / `session:error` | 会话完成 / 错误 |
| `cost:update` | 成本更新 |
| `heartbeat` | 心跳（15s） |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ANTHROPIC_BASE_URL` | `http://127.0.0.1:15721` | CCSwitch 代理地址 |
| `ANTHROPIC_AUTH_TOKEN` | `PROXY_MANAGED` | CCSwitch 认证令牌 |
| `DECOMPOSER_MODEL` | `claude-opus-4-8` | 拆解模型 |
| `EXECUTOR_MODEL` | `claude-sonnet-5` | 执行 + 对话模型 |
| `CODEX_CLI_PATH` | `codex` | Codex CLI 路径 |
| `CODEX_MODEL` | `claude-sonnet-5` | Codex 使用的模型 |
| `CODEX_TIMEOUT_MS` | `300000` | Codex 执行超时 (ms) |
| `MAX_CONCURRENT_SUBTASKS` | `5` | 最大并行子任务数 |
| `MAX_RETRIES` | `3` | 子任务失败最大重试次数 |
| `TASK_TIMEOUT_MS` | `1800000` | 任务整体超时 (ms) |
| `PORT` | `3001` | 服务端口 |
| `LANGUAGE` | `zh` | 界面语言 (zh / en) |

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + TypeScript + Express 5 + multer |
| AI | @anthropic-ai/sdk (Opus 4.8 / Sonnet 5 via CCSwitch) |
| Codex | Codex CLI 0.143+ (JSON mode, `--cd` workspace) |
| 前端 | React 19 + Vite + Tailwind CSS 4 |
| 状态 | Zustand 5 |
| 动画 | Framer Motion 12 |
| 实时 | Server-Sent Events (SSE) |
| 文件检测 | file-type (Magic Number) |
| 测试 | Vitest + Testing Library |
| 日志 | pino |
| 持久化 | JSON 文件 (data/sessions.json)，上传文件 (server/uploads/)，24h 自动清理 |

## 验证命令

```bash
npx tsc --noEmit -p server/tsconfig.json   # 服务端类型检查
npx tsc --noEmit -p web/tsconfig.json      # 前端类型检查
npx vite build --config web/vite.config.ts  # 生产构建
npm test                                    # 全部测试 (24)
```

## 最近更新

| 提交 | 说明 |
|------|------|
| `1f57206` | 确认门控、流式超时保护、文件超链接、内联图片渲染 |
| `3898e6d` | 终态消息回到 chatting 模式，不再自动拆解 |
| `d5c0df3` | 桌面端加宽至 max-w-5xl，固定高度聊天面板，独立滚动 |
| `129db42` | 延迟会话创建、暂存上传、异步发送、内存清理 |
| `512a2dc` | UI 润色、焦点陷阱、灯箱修复、CSS 变量体系 |
| `cb2de9f` | 整体 UI 重新设计：暗色主题、CSS 变量、Framer Motion |
| `600a65b` | 文件/图片上传 + 粘贴支持 + 附件基础设施 |

## License

MIT
