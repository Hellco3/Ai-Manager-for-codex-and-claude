# AI Manager for Codex & Claude

AI 任务编排平台 — 提交任务后，Claude 自动拆解为子任务，分发给 Codex CLI 和 Claude API 并行执行，前端实时展示泳道式进度。

## 架构

```
用户提交任务 → React Frontend → POST /api/tasks
                                    ↓
                              Orchestrator (编排引擎)
                              ├── Decomposer (Claude Opus 拆解)
                              ├── [半自动模式: 等待用户审核]
                              ├── Executors (并行执行)
                              │   ├── Claude API (分析/设计/研究)
                              │   └── Codex CLI (编码/集成)
                              └── Aggregator (结果聚合)
                                    ↓
                              SSE Manager → 实时推送进度
                                    ↓
                              React SwimLane UI (泳道可视化)
```

## 项目结构

```
ai_manager/
├── shared/          # 前后端共享 Zod 类型定义
│   └── src/schemas/ # Subtask, TaskDecomposition, SSEEvent
├── server/          # Express + TypeScript 后端
│   └── src/
│       ├── services/     # 核心服务
│       │   ├── orchestrator.ts    # 编排引擎 (状态机 + DAG 并行 + 重试)
│       │   ├── decomposer.ts      # Claude 任务拆解 (含输出归一化)
│       │   ├── executor-claude.ts # Claude API 流式执行器
│       │   ├── executor-codex.ts  # Codex CLI 子进程执行器 (JSON mode)
│       │   └── aggregator.ts      # 结果聚合
│       ├── sse/manager.ts         # SSE 连接管理 + 断线重播
│       ├── store/session-store.ts # 会话存储 (内存 + 文件持久化 + 原子状态转换)
│       ├── queue/task-queue.ts    # 任务队列
│       ├── routes/tasks.ts        # REST API 路由
│       └── utils/                 # 重试 / 超时 / 日志 / 成本追踪
├── web/             # React 19 + Vite + Tailwind CSS 前端
│   └── src/
│       ├── pages/          # TaskSubmit (提交) / TaskProgress (进度 + 对话)
│       ├── components/
│       │   ├── pipeline/   # SwimLane / PipelineView / SubtaskList / LogDrawer
│       │   ├── chat/       # ChatPanel / ChatMessage / ChatInput (多轮对话)
│       │   ├── task/       # TaskForm / DecompositionReview
│       │   ├── stats/      # CostPanel / TimePanel
│       │   └── common/     # StatusBadge / ThemeToggle
│       ├── hooks/useSSE.ts # SSE 连接 + 断线重连 + 流式清理
│       └── store/          # Zustand 状态管理 (pipeline / session / theme)
└── tsconfig.base.json
```

## 功能

- **智能拆解**: Claude Opus 4.8 分析任务，JSON Schema 结构化输出子任务，内置 LLM 输出归一化修复常见格式问题
- **并行执行**: DAG 依赖解析，最大 5 并发，Claude API + Codex CLI 双引擎，失败自动重试（最多 3 次）
- **实时进度**: SSE 推送，泳道式 UI 展示 Claude/Codex 并行任务流
- **多轮对话**: 任务完成后可在聊天面板中继续对话，AI 流式回复后重新拆解并执行新的子任务
- **流式 AI 回复**: SSE 实时推送 AI 的对话响应（逐字流式输出），带输入中动画
- **双模式**: 全自动（一键执行）/ 半自动（先审核拆解再执行）
- **主题切换**: 暗色 / 亮色模式切换，持久化到 localStorage
- **移动端适配**: 对话面板在移动端自动切换为底部抽屉 + 悬浮操作按钮（FAB）
- **成本追踪**: Token 消耗 + 耗时统计，按模型分开展示
- **生产保障**: 文件持久化（自动创建目录）、限流、pino 日志、优雅关闭、AbortSignal 传播、原子状态转换防并发

## 快速开始

```bash
# 1. 配置环境变量
cp .env.example .env
# 无需 API Key — 复用 CCSwitch 代理，自动使用 PROXY_MANAGED

# 2. 启动
npm run dev

# 3. 浏览器访问
# http://localhost:5173
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
| POST | `/api/tasks` | 提交任务 → 返回 sessionId |
| GET | `/api/tasks/:id` | 查询任务状态 + 对话历史 + 成本统计 |
| POST | `/api/tasks/:id/approve` | 半自动模式确认拆解 |
| POST | `/api/tasks/:id/cancel` | 取消任务（终止进程） |
| POST | `/api/sessions/:id/message` | 发送跟进消息（多轮对话），原子状态转换防并发 |
| POST | `/api/sessions/:id/reconstruct` | 重新规划未完成的子任务 |
| GET | `/api/sessions/:id/stream` | SSE 实时进度流 |

## 多轮对话

任务完成后，可在右侧（桌面端）或底部抽屉（移动端）打开对话面板：

1. 在输入框中输入跟进消息（如"增加错误处理"、"优化性能"）
2. AI 先流式回复你的问题，然后重新拆解并执行新的子任务
3. 所有对话历史保存在会话中，刷新页面后依然可见
4. 点击"重新规划"按钮可基于当前状态重新分析

## 任务生命周期

```
DECOMPOSING → [AWAITING_REVIEW (semi-auto)] → EXECUTING → AGGREGATING → COMPLETED
                                                                         ↓
                                                                       FAILED
```

子任务状态: `pending → queued → running → completed / failed / timed_out / cancelled`

## SSE 事件类型

| 事件 | 说明 |
|------|------|
| `session:created` | 会话已创建 |
| `stage:started` / `stage:completed` | 阶段状态变更 |
| `stage:awaiting_review` | 半自动模式等待审核 |
| `subtask:started` / `subtask:progress` / `subtask:completed` / `subtask:failed` / `subtask:timed_out` | 子任务状态流 |
| `message:chunk` | AI 对话流式输出片段 |
| `message:complete` | AI 对话消息完成（含角色标识） |
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
| `CODEX_TIMEOUT_MS` | `300000` | Codex 执行超时 (ms) |
| `MAX_CONCURRENT_SUBTASKS` | `5` | 最大并行子任务数 |
| `MAX_RETRIES` | `3` | 子任务失败最大重试次数 |
| `TASK_TIMEOUT_MS` | `1800000` | 任务整体超时 (ms) |
| `PORT` | `3001` | 服务端口 |
| `LANGUAGE` | `zh` | 界面语言 (zh / en) |

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + TypeScript + Express 5 |
| AI | @anthropic-ai/sdk (Opus 4.8 / Sonnet 5 via CCSwitch) |
| 前端 | React 19 + Vite + Tailwind CSS 4 |
| 状态 | Zustand |
| 动画 | Framer Motion |
| 实时 | Server-Sent Events (SSE) |
| 测试 | Vitest + Testing Library |
| 日志 | pino |
| 持久化 | JSON 文件 (data/sessions.json)，24h 自动清理 |

## 验证命令

```bash
npx tsc --noEmit -p server/tsconfig.json   # 服务端类型检查
npx tsc --noEmit -p web/tsconfig.json      # 前端类型检查
npx vite build --config web/vite.config.ts  # 生产构建
npm test                                    # 全部测试
```

## License

MIT
