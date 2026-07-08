# Project: AI Manager for Codex & Claude

## Overview

AI task orchestration platform (H5 web app). User submits a task → Claude decomposes into subtasks → distributes to Codex CLI + Claude API in parallel → aggregates results. Real-time SwimLane progress visualization with SSE streaming.

**GitHub**: github.com/Hellco3/Ai-Manager-for-codex-and-claude
**Directory**: `E:/Code/ai_manager`

## Quick Start

```bash
npm run dev          # starts server (3001) + web (5173)
npm test             # 24 tests (7 server + 17 web)
npm run test:server  # server tests only
npm run test:web     # web tests only
```

- Web UI: http://localhost:5173
- Health check: http://localhost:3001/health

## Architecture

```
user submits task → POST /api/tasks
    → Orchestrator.startSession()
        → Decomposer (Claude API via CCSwitch)
        → [semi-auto: wait for /api/tasks/:id/approve]
        → Execute stage (DAG, max 5 concurrent)
            → code subtasks → Codex CLI (child_process.spawn)
            → analysis/design/research/integration → Claude API (streaming)
        → Aggregate → SSE broadcasts
    → Frontend PipelineView + SwimLaneView
```

### No API Key Required

The project reuses your existing CCSwitch proxy (same as Claude Code):
- `ANTHROPIC_BASE_URL=http://127.0.0.1:15721`
- `ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED`
- CCSwitch maps `claude-opus-4-8` and `claude-sonnet-5` → DeepSeek models

### Multi-turn Conversation

- `POST /api/sessions/:id/message` — send follow-up message within a session
- `POST /api/sessions/:id/reconstruct` — re-decompose remaining work
- Messages stored in `session.messages[]`, re-decomposed with full conversation context

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + TypeScript + Express 5 |
| AI | @anthropic-ai/sdk (Claude models via CCSwitch) |
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| State | Zustand |
| Animation | Framer Motion (SwimLane cards) |
| Real-time | Server-Sent Events (SSE) |
| Testing | Vitest (server) + Vitest + Testing Library (web) |
| Logging | pino |
| Persistence | JSON file (data/sessions.json), 24h cleanup |

## File Map

```
E:/Code/ai_manager/
├── shared/src/          ← Zod schemas shared by server + web
│   └── schemas/
│       ├── task.ts      → Subtask, TaskDecomposition, CostStats, AggregatedResult
│       └── progress.ts  → SSEEvent discriminated union, PipelineState, SessionState
├── server/src/
│   ├── config.ts        → Environment config (CCSwitch, models, timeouts)
│   ├── index.ts         → Express app, rate limiting, graceful shutdown
│   ├── routes/tasks.ts  → REST API: POST/GET tasks, approve, cancel, SSE stream, message, reconstruct
│   ├── services/
│   │   ├── orchestrator.ts   → State machine: decompose→review→execute→aggregate; DAG parallel execution
│   │   ├── decomposer.ts     → Calls Claude via CCSwitch to break tasks into Subtask[]
│   │   ├── executor-claude.ts → Streaming Claude API call via CCSwitch
│   │   ├── executor-codex.ts  → Codex CLI child_process.spawn with abort signal
│   │   └── aggregator.ts     → Combines subtask results
│   ├── sse/manager.ts        → SSE connection registry, Event ID, replay, heartbeat
│   ├── store/session-store.ts → In-memory + JSON file persistence, 24h expiry
│   ├── queue/task-queue.ts   → Simple in-memory job queue
│   ├── workers/codex-worker.ts → Codex CLI worker wrapper
│   └── utils/
│       ├── retry.ts       → withRetry(), withTimeout(), DeadLetterQueue
│       ├── cost-tracker.ts → Per-model token + cost tracking
│       └── logger.ts      → pino structured logger
├── web/src/
│   ├── i18n.ts           → Chinese (zh) / English (en) translations, auto-detection
│   ├── pages/
│   │   ├── TaskSubmit.tsx    → Task form + mode toggle + feature cards
│   │   └── TaskProgress.tsx  → Pipeline + SwimLane + Subtask list + stats
│   ├── components/
│   │   ├── pipeline/
│   │   │   ├── PipelineView.tsx   → 4-stage pipeline with Framer Motion animations
│   │   │   ├── SwimLaneView.tsx   → Claude/Codex dual-lane parallel visualization
│   │   │   ├── SubtaskList.tsx    → Expandable subtask list with View Log
│   │   │   ├── SubtaskCard.tsx    → Individual subtask card
│   │   │   └── LogDrawer.tsx      → Slide-out log panel
│   │   ├── task/
│   │   │   ├── TaskForm.tsx           → Task input + auto/semi-auto toggle
│   │   │   └── DecompositionReview.tsx → Semi-auto approval UI
│   │   ├── stats/
│   │   │   ├── CostPanel.tsx      → Per-model cost breakdown
│   │   │   └── TimePanel.tsx      → Total duration display
│   │   └── common/StatusBadge.tsx → Color-coded status indicator
│   ├── api/client.ts      → fetch wrappers + SSE EventSource factory
│   ├── hooks/useSSE.ts    → SSE connection with exponential backoff reconnect
│   └── store/
│       ├── pipeline-store.ts → Zustand: stages, subtasks, costs, SSE event dispatch
│       └── session-store.ts  → Zustand: session lifecycle state
├── .env               → Working config (no API key needed)
├── .env.example       → Template
├── README.md
├── .gitignore
└── tsconfig.base.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Submit task → { sessionId, status } |
| GET | `/api/tasks/:id` | Get session state + decomposition + subtask states + costs |
| POST | `/api/tasks/:id/approve` | Semi-auto: approve decomposition |
| POST | `/api/tasks/:id/cancel` | Cancel + abort running processes |
| POST | `/api/sessions/:id/message` | Send follow-up conversational message |
| POST | `/api/sessions/:id/reconstruct` | Re-decompose remaining work |
| GET | `/api/sessions/:id/stream` | SSE event stream |
| GET | `/health` | Health check |

## SSE Events

`socket:created`, `stage:started`, `stage:completed`, `stage:awaiting_review`,
`subtask:started`, `subtask:progress`, `subtask:completed`, `subtask:failed`,
`subtask:timed_out`, `cost:update`, `session:complete`, `session:error`, `heartbeat`

## Task Lifecycle (State Machine)

```
DECOMPOSING → [AWAITING_REVIEW (semi-auto)] → EXECUTING → AGGREGATING → COMPLETED
                                                                         ↓
                                                                       FAILED
```

Subtask states: `pending → queued → running → completed / failed / timed_out / cancelled`

## Key Design Decisions

1. **CCSwitch proxy** — No API key needed; reuses Claude Code's proxy
2. **SSE over WebSocket** — Unidirectional streaming sufficient, simpler
3. **DAG dependency resolution** — Subtasks with satisfied deps run first, max 5 concurrent
4. **Codex CLI via spawn (not exec)** — Real-time stdout streaming + abort signal
5. **Chinese i18n** — Full zh/en support, auto-detected from browser
6. **Multi-turn conversation** — Session message history, re-decomposition with context
7. **File persistence** — JSON sessions file, auto-flush every 30s, 24h cleanup

## Tests

```
npm test
# Server: 7 tests (SessionStore, TaskQueue, Config, RetryUtils, CostTracker)
# Web:    17 tests (App, TaskForm, StatusBadge, PipelineStore)
# All passing: 24/24
```

## Current .env

```bash
LANGUAGE=zh
ANTHROPIC_BASE_URL=http://127.0.0.1:15721
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED
DECOMPOSER_MODEL=claude-opus-4-8
EXECUTOR_MODEL=claude-sonnet-5
CODEX_CLI_PATH=codex
CODEX_TIMEOUT_MS=300000
TASK_TIMEOUT_MS=1800000
MAX_CONCURRENT_SUBTASKS=5
PORT=3001
```

## Verification Commands

```bash
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json  # Server types
node node_modules/typescript/bin/tsc --noEmit -p web/tsconfig.json     # Web types
npx vite build --config web/vite.config.ts                              # Production build
npm test                                                               # All tests
```

## Git Rules

- **Every code iteration gets a git commit** with descriptive message
- Push to `github.com/Hellco3/Ai-Manager-for-codex-and-claude`
- Working tree should be clean after each task

## Known Issues / Future

- WSL needs Node.js installed separately (not yet tested)
- Dark/light theme toggle not yet implemented
- Mobile responsive layout needs work
- Session history page not built
- Subtask re-run from UI not implemented
- LLM decomposition sometimes includes JSON in markdown fences (parser handles this)
