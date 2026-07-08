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
│       │   ├── orchestrator.ts    # 编排引擎 (状态机 + DAG 并行)
│       │   ├── decomposer.ts      # Claude 任务拆解
│       │   ├── executor-claude.ts # Claude API 流式执行器
│       │   ├── executor-codex.ts  # Codex CLI 子进程执行器
│       │   └── aggregator.ts      # 结果聚合
│       ├── sse/manager.ts         # SSE 连接管理 + 断线重播
│       ├── store/session-store.ts # 会话存储 (内存 + 文件持久化)
│       ├── queue/task-queue.ts    # 任务队列
│       ├── routes/tasks.ts        # REST API 路由
│       └── utils/                 # 重试 / 日志 / 成本追踪
├── web/             # React 19 + Vite + Tailwind CSS 前端
│   └── src/
│       ├── pages/          # TaskSubmit (提交) / TaskProgress (进度)
│       ├── components/
│       │   ├── pipeline/   # SwimLane / PipelineView / SubtaskList / LogDrawer
│       │   ├── task/       # TaskForm / DecompositionReview
│       │   ├── stats/      # CostPanel / TimePanel
│       │   └── common/     # StatusBadge
│       ├── hooks/useSSE.ts # SSE 连接 + 断线重连
│       └── store/          # Zustand 状态管理
└── tsconfig.base.json
```

## 功能

- **智能拆解**: Claude Opus 4.8 分析任务，JSON Schema 结构化输出子任务
- **并行执行**: DAG 依赖解析，最大 5 并发，Claude API + Codex CLI 双引擎
- **实时进度**: SSE 推送，泳道式 UI 展示 Claude/Codex 并行任务流
- **双模式**: 全自动（一键执行）/ 半自动（先审核拆解再执行）
- **成本追踪**: Token 消耗 + 耗时统计
- **生产保障**: 文件持久化、限流、pino 日志、优雅关闭、AbortSignal 传播

## 快速开始

```bash
# 1. 配置 API Key
cp .env.example .env
# 编辑 .env 填入 ANTHROPIC_API_KEY=sk-ant-api03-...

# 2. 启动
npm run dev

# 3. 浏览器访问
# http://localhost:5173
```

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | 提交任务 → 返回 sessionId |
| GET | `/api/tasks/:id` | 查询任务状态 + 成本统计 |
| POST | `/api/tasks/:id/approve` | 半自动模式确认拆解 |
| POST | `/api/tasks/:id/cancel` | 取消任务 (终止进程) |
| GET | `/api/sessions/:id/stream` | SSE 实时进度流 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ANTHROPIC_API_KEY` | (必需) | Anthropic API 密钥 |
| `DECOMPOSER_MODEL` | `claude-opus-4-8` | 拆解模型 |
| `EXECUTOR_MODEL` | `claude-sonnet-5` | 执行模型 |
| `CODEX_CLI_PATH` | `codex` | Codex CLI 路径 |
| `CODEX_TIMEOUT_MS` | `300000` | Codex 执行超时 (ms) |
| `MAX_CONCURRENT_SUBTASKS` | `5` | 最大并行子任务数 |
| `PORT` | `3001` | 服务端口 |

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + TypeScript + Express |
| AI | @anthropic-ai/sdk (Opus 4.8 / Sonnet 5) |
| 前端 | React 19 + Vite + Tailwind CSS |
| 状态 | Zustand |
| 动画 | Framer Motion |
| 实时 | Server-Sent Events (SSE) |
| 日志 | pino |

## License

MIT
