## 聊天优先模式迭代 — 完成 ✅

### 当前状态
- **服务器**: 已关闭
- **工作区**: 干净（所有内容已提交）
- **GitHub**: 已推送至 `master`
- **测试**: 24/24 通过（7 项服务端 + 17 项前端）
- **TypeScript**: 0 个错误
- **生产构建**: 成功

### 本轮新增内容（`ec0ff91` → `c34b679`）

**聊天优先模式（`/` 路由）**
- 默认着陆页现在是一个全宽聊天界面（`ChatFirst.tsx`）
- 用户直接输入消息，无需先填写任务表单
- AI 会先进行对话回复（状态：`chatting`）
- 用户可以讨论需求、明确期望、给 AI 提问的机会
- 当一切就绪后，用户点击「开始任务」即可触发拆解 + 执行
- 执行完成后，AI 会在聊天中流式输出汇报摘要

**项目文件夹选择器**
- 聊天面板顶部有一个文件夹选择器（`WorkspaceSelector.tsx`）
- 用户可以输入或浏览项目目录路径
- 设置的路径会传给 Codex CLI 的 `--cd` 参数
- Codex 会在该目录中创建和修改文件
- 如果不设置，默认使用当前工作目录

**修改的核心文件**
| 文件 | 改动 |
|------|------|
| `web/src/pages/ChatFirst.tsx` | 新文件 — 聊天优先首页 |
| `web/src/components/chat/WorkspaceSelector.tsx` | 新文件 — 项目文件夹选择器 |
| `web/src/App.tsx` | `/` 路由改为 ChatFirst，新增 `/submit` 备用表单入口 |
| `shared/src/schemas/task.ts` | 新增 `chatting` 状态 |
| `shared/src/schemas/progress.ts` | SessionState 新增 `workspaceDir` |
| `server/src/routes/tasks.ts` | 新增 `POST /:id/confirm`、`POST /:id/workspace`；修改 `POST /api/tasks` |
| `server/src/services/orchestrator.ts` | 新增 `chatFirstPhase()`、`confirmAndDecompose()` |
| `server/src/services/executor-codex.ts` | 新增 `workspaceDir` → `--cd` 参数 |
| `server/src/store/session-store.ts` | 新增 `chat-first` 模式、`setWorkspaceDir()` |
| `web/src/store/pipeline-store.ts` | 新增 `isChatPhase`、`workspaceDir` |
| `web/src/api/client.ts` | 新增 `confirmTask()`、`updateWorkspace()` |
| `web/src/i18n.ts` | 新增 `chatFirst`、`workspace` 翻译段 |
| `web/src/store/session-store.ts` | 更新支持 `'chat-first'` 模式 |

### 提交历史
```
ec0ff91 fix: update App test for chat-first mode (two h1 elements on page)
c34b679 feat: chat-first mode with workspace directory support
7f8e29e fix: restore CodexExecutionResult return type in codex-worker
69069ae fix: correct SwimLane lane assignment — design subtasks now go to Claude lane
feb9f71 docs: update README with latest features and improvements
e8d6101 feat: production-hardened Codex executor, retry logic, atomic state transitions
c2a89e9 fix: add retry logic and improve executor error handling
52dff8d fix: add decomposition output normalization layer
```
