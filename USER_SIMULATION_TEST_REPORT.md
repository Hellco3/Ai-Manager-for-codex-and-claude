# 用户模拟与全流程测试报告

日期：2026-07-10（Asia/Shanghai）
项目：`ai_manager`
执行人：Codex

## 1. 结论

本轮结论：**工程验证已达到候选发布条件；真实 AI 提供商闭环仍需单独验收**。

开发态的基础页面、健康检查、`chat-first` 会话创建/查询和文本附件上传可以正常工作，41 个 Vitest 用例全部通过，前端生产构建通过，生产依赖审计未发现已知漏洞。使用本机 Edge 完成桌面与 375×812 移动端视觉和交互复测后，2 个 Playwright 用户流程用例全部通过。

本轮后续修复已解决后端 TypeScript 构建问题，并让 Playwright 自动启动 Vite、完整隔离 mock API；server/web 生产构建、41 个 Vitest 和 2 个 Playwright 用例现均通过。

AI 拆解、Codex/Claude 执行、SSE 完成回传和结果聚合依赖外部模型服务，仍未在本轮进行会产生实际执行副作用的真实提供商端到端调用。

## 2. 测试范围与环境

- 操作系统：Windows，PowerShell
- Node/npm：使用当前工作区已安装环境
- 后端：`http://127.0.0.1:3001`
- 前端：`http://127.0.0.1:5173`
- 检查范围：依赖、单元/组件测试、类型与生产构建、开发服务、REST 主链路、上传边界、E2E 可执行性、源码关键路径、依赖安全审计
- 未修改产品源码；仅覆盖本报告

## 3. 结果总览

| 检查项 | 结果 | 证据 |
|---|---|---|
| 服务端单元测试 | 通过 | 2 个测试文件，22/22 用例通过 |
| 前端组件/状态测试 | 通过 | 4 个测试文件，19/19 用例通过 |
| 全部 Vitest | 通过 | 合计 41/41 |
| 前端生产构建 | 通过 | TypeScript 与 Vite 构建成功，生成 `web/dist` |
| 后端生产构建 | 通过 | TypeScript 编译成功并生成 `server/dist` |
| 开发服务启动 | 通过 | 后端监听 3001，前端监听 5173 |
| 健康检查 | 通过 | `GET /health` 返回 `status: ok` |
| 首页静态入口 | 通过 | `GET /` 返回 200，HTML 含 `#root` |
| `chat-first` 会话创建 | 通过 | 返回 sessionId，状态为 `chatting` |
| 会话查询与工作目录回读 | 通过 | 状态、mode、workspaceDir 与创建请求一致 |
| 非法任务请求 | 通过 | 空请求体返回 400 |
| Markdown 文本附件上传 | 通过 | 返回 1 个附件，MIME 为 `text/markdown` |
| 上传缺少 sessionId | 通过 | 返回 400 |
| Playwright E2E | 通过 | Edge 通道运行，2/2 用例通过 |
| 浏览器点击/视觉/移动端 | 通过 | 检查 1440×1100 桌面端和 375×812 移动端；无控制台警告/错误及失败请求 |
| 真实 AI 拆解与执行闭环 | 未执行 | 依赖外部 Claude/Codex 服务，且会触发实际工作区操作与成本 |
| 生产依赖审计 | 通过 | `npm audit --omit=dev`：0 个已知漏洞 |

## 4. 执行记录

### 4.1 自动化测试

执行：

```powershell
npm test
```

结果：

- Server：22/22 通过。
- Web：19/19 通过。
- 总计：41/41 通过。

覆盖内容包括 SessionStore、任务队列、配置、重试路由、成本聚合，以及前端 App、TaskForm、StatusBadge、PipelineStore。现有测试以单元和组件级为主，不能替代真实浏览器和真实 AI 服务的端到端验收。

### 4.2 生产构建

执行：

```powershell
npm run build -w server
npm run build -w web
```

结果：

- Web：通过；主 JS 产物约 470.78 kB，gzip 后约 144.77 kB。
- Server：失败；错误集中在 `server/src/services/orchestrator.ts:430-448`。

### 4.3 开发态真实接口 smoke test

执行真实前后端开发服务后验证：

1. `GET /health`：返回 `ok`。
2. `GET /`：返回 200，页面入口包含 `id="root"`。
3. `POST /api/tasks`，使用 `mode=chat-first`、`deferInitialMessage=true` 和当前工作目录：成功创建会话。
4. `GET /api/tasks/:id`：返回 `chatting`、`chat-first` 及正确的 workspaceDir。
5. 空任务提交：返回 400。
6. 上传 `README.md`：成功识别为 `text/markdown` 并关联会话。
7. 上传缺少 sessionId：返回 400。

测试会话 ID：`ba4f389d-bfd2-47fb-b83f-6c7563dad518`。会话和附件可能按项目设计保存在被 `.gitignore` 忽略的数据目录中；测试完成后工作树仍为干净状态。

### 4.4 E2E 与浏览器检查

执行：

```powershell
npx playwright test -c tests/e2e/playwright.config.ts
```

首次执行因本地无法解析 `@playwright/test` 而失败。补齐并升级开发依赖后，Chromium 浏览器包下载因 CDN TLS 连接重置未成功，但本机 Edge 可用，且测试配置使用 `msedge` 通道。修正已经落后于现有 UI/延迟建会话流程的 mock 和选择器后，最终结果为 **2/2 通过**。

桌面端实际完成欢迎页、首轮聊天、确认执行、拆解/子任务/完成事件、附件上传、气泡溢出、执行面板宽度、控制台和失败请求检查；移动端完成执行抽屉开关和底部 sticky 输入区检查。截图检查未发现遮挡、横向溢出、乱码或明显错位。桌面空状态会在聊天区和右侧执行面板各显示一份引导文案，这是两个不同区域的设计，不是元素重叠。

该用例使用浏览器内 API mock，不连接真实后端或模型服务，因此验证的是 UI 和前端状态流，不是外部 AI 提供商闭环。

## 5. 缺陷与风险

### 已修复：后端生产构建失败

位置：`server/src/services/orchestrator.ts:430-448`

`entries` 被推断/声明为不兼容的 `Dirent<NonSharedBuffer>[]`，而 `fs.readdir(dir, { withFileTypes: true })` 返回字符串名称的 Dirent。随后 `entry.name` 传给 `path.join`、`includes` 和 `path.extname` 时继续产生类型错误。

目录项现显式使用 `Dirent[]` 并将 `entry.name` 作为字符串处理；`npm run build` 已同时完成 server 与 web 构建。建议继续在 CI 中保留该命令作为发布门禁。

### 已修复：端到端测试依赖与用例漂移

位置：`tests/e2e/playwright.config.ts`、`tests/e2e/chat-first.spec.ts`、根 `package.json`

本轮已安装/升级 `@playwright/test`，并修复以下测试漂移：延迟创建会话未被 mock、`Workspace` 文案已改为“工作区”、重复响应式 DOM 导致 strict locator 冲突、左侧会话栏被误判为执行面板，以及旧的消息数量和宽度阈值。

Playwright 配置现已加入 `webServer`，会自动启动 Vite；`/api/sessions` 也已纳入 mock，因此无需人工预启动后端。剩余建议是区分 `e2e:mock` 与 `e2e:real`；CI 环境仍需安装 Edge 或成功执行相应 Playwright 浏览器安装命令。

### P1：当前“全流程”覆盖存在明显空洞

当前 Vitest 与 Playwright mock 测试没有证明以下链路真实可用：

- 用户消息经后端流式返回。
- 显式确认后进行任务拆解。
- Claude/Codex 子任务执行、失败重试、取消和超时。
- SSE 断线重连与事件重放。
- 聚合结果、成本统计与进程重启后的持久化。
- 更完整的可访问性审计（屏幕阅读器、高对比度、缩放和完整键盘路径）。

建议为外部模型接口增加确定性 stub，建立不消耗真实额度、不会修改用户项目的集成环境；再单独保留一组受控的真实提供商验收。

### P1：工作目录接口的信任边界较宽

`POST /api/sessions/:id/workspace` 只验证路径存在，服务端随后可让 Codex 在该目录工作；服务默认监听 `0.0.0.0`，接口层未见身份认证。

影响：若服务暴露到非可信网络，调用方可能指定服务账户可访问的任意本地目录并触发后续代理操作。

建议：产品若不仅限于单机可信使用，应增加认证、允许目录根列表、规范化后的子路径校验，并默认仅监听 loopback。若明确定位为单机工具，应在 README 和启动日志中醒目标注安全边界。

### 已修复：README 的测试数量已过时

README 两处现已同步为 41 项（22 server + 19 web）。后续建议避免手工维护易漂移的数量。

### P2：前端主包需要持续关注

前端构建主 JS 约 470.78 kB（gzip 144.77 kB），当前未触发 Vite 500 kB 警告，但已接近默认提示阈值。建议后续对非首屏执行面板、动画或历史页面做按路由/组件懒加载，并建立 bundle size 门禁。

## 6. 发布前最低验收清单

1. 在 CI 中串联：安装、Vitest、server build、web build、E2E、依赖审计。
2. 用可控模型 stub 跑通“创建会话 → 对话 → 显式确认 → 拆解 → 执行 → SSE → 聚合 → 刷新回读”。
3. 补充屏幕阅读器、高对比度、缩放和完整键盘路径测试。
4. 明确单机/联网部署的安全边界，并限制 workspaceDir。

当前工程质量门禁已通过；完成受控的真实后端/模型集成验收后，可进入正式发布阶段。
