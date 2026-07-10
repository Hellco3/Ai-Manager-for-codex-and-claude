# 用户模拟与全流程测试报告

日期：2026-07-10（Asia/Shanghai）
项目：`ai_manager`
执行人：Codex

## 1. 结论

本轮结论：**不建议以当前提交作为可发布版本**。

开发态的基础页面、健康检查、`chat-first` 会话创建/查询和文本附件上传可以正常工作，25 个 Vitest 用例全部通过，前端生产构建通过，生产依赖审计未发现已知漏洞。但发布主链路存在两个阻断项：

1. 后端 TypeScript 生产构建失败，无法得到可发布的 `server/dist`。
2. 仓库中的 Playwright 用户流程测试无法运行，缺少 `@playwright/test` 依赖及统一的 npm 执行入口。

此外，本次环境没有可用的 in-app Browser 实例，因此桌面/移动端的真实点击、视觉布局、控制台和网络请求检查均不能判定为通过。AI 拆解、Codex/Claude 执行、SSE 完成回传和结果聚合依赖外部模型服务，也未在本轮进行会产生实际执行副作用的端到端调用。

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
| 服务端单元测试 | 通过 | 1 个测试文件，8/8 用例通过 |
| 前端组件/状态测试 | 通过 | 4 个测试文件，17/17 用例通过 |
| 全部 Vitest | 通过 | 合计 25/25 |
| 前端生产构建 | 通过 | TypeScript 与 Vite 构建成功，生成 `web/dist` |
| 后端生产构建 | **失败** | `orchestrator.ts` 出现 4 个 TypeScript 类型错误 |
| 开发服务启动 | 通过 | 后端监听 3001，前端监听 5173 |
| 健康检查 | 通过 | `GET /health` 返回 `status: ok` |
| 首页静态入口 | 通过 | `GET /` 返回 200，HTML 含 `#root` |
| `chat-first` 会话创建 | 通过 | 返回 sessionId，状态为 `chatting` |
| 会话查询与工作目录回读 | 通过 | 状态、mode、workspaceDir 与创建请求一致 |
| 非法任务请求 | 通过 | 空请求体返回 400 |
| Markdown 文本附件上传 | 通过 | 返回 1 个附件，MIME 为 `text/markdown` |
| 上传缺少 sessionId | 通过 | 返回 400 |
| Playwright E2E | **阻塞** | 无法解析 `@playwright/test` |
| 浏览器点击/视觉/移动端 | **阻塞** | 测试环境无可用 in-app Browser 实例 |
| 真实 AI 拆解与执行闭环 | 未执行 | 依赖外部 Claude/Codex 服务，且会触发实际工作区操作与成本 |
| 生产依赖审计 | 通过 | `npm audit --omit=dev`：0 个已知漏洞 |

## 4. 执行记录

### 4.1 自动化测试

执行：

```powershell
npm test
```

结果：

- Server：8/8 通过。
- Web：17/17 通过。
- 总计：25/25 通过。

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

结果：失败于测试启动阶段：`Cannot find module '@playwright/test'`。npm 临时获取了 `playwright` CLI，但项目自身没有声明测试代码所导入的 `@playwright/test`。

仓库中的 `tests/e2e/chat-first.spec.ts` 使用浏览器内 API mock，覆盖桌面聊天、确认执行、附件上传和移动抽屉，但它并不连接真实后端或模型服务。另一个 `e2e/playwright-chat-e2e.mjs` 也未被根目录 npm scripts 纳入统一测试流程。

## 5. 缺陷与风险

### P0：后端生产构建失败

位置：`server/src/services/orchestrator.ts:430-448`

`entries` 被推断/声明为不兼容的 `Dirent<NonSharedBuffer>[]`，而 `fs.readdir(dir, { withFileTypes: true })` 返回字符串名称的 Dirent。随后 `entry.name` 传给 `path.join`、`includes` 和 `path.extname` 时继续产生类型错误。

影响：

- `npm run build -w server` 退出码为 2。
- 无法可靠生成并运行生产服务端产物。
- 根目录没有统一 build 脚本，CI 若只运行 `npm test` 会漏掉该阻断问题。

建议：显式使用与字符串编码匹配的 Dirent 类型，或直接让 `entries` 由 `fs.readdir(..., { withFileTypes: true })` 推断；修复后同时执行服务端 build 和 start smoke test。

### P0：端到端测试不可执行

位置：`tests/e2e/playwright.config.ts`、`tests/e2e/chat-first.spec.ts`、根 `package.json`

影响：

- 新环境按仓库依赖安装后无法运行已有 E2E。
- README 描述的用户主流程没有可复现的一键验收命令。
- UI 回归、控制台错误、移动端布局和上传交互无法在 CI 中形成质量门禁。

建议：

- 将 `@playwright/test` 固定到 devDependencies。
- 增加 `test:e2e` 脚本，并明确浏览器安装命令。
- 将 dev server 启动配置写入 Playwright `webServer`，避免依赖人工先启动 Vite。
- 区分 `e2e:mock` 与 `e2e:real`，后者连接真实后端并用可控的模型 stub 或测试代理。

### P1：当前“全流程”覆盖存在明显空洞

当前 Vitest 与 Playwright mock 测试没有证明以下链路真实可用：

- 用户消息经后端流式返回。
- 显式确认后进行任务拆解。
- Claude/Codex 子任务执行、失败重试、取消和超时。
- SSE 断线重连与事件重放。
- 聚合结果、成本统计与进程重启后的持久化。
- 桌面与移动端真实浏览器的可访问性和视觉表现。

建议为外部模型接口增加确定性 stub，建立不消耗真实额度、不会修改用户项目的集成环境；再单独保留一组受控的真实提供商验收。

### P1：工作目录接口的信任边界较宽

`POST /api/sessions/:id/workspace` 只验证路径存在，服务端随后可让 Codex 在该目录工作；服务默认监听 `0.0.0.0`，接口层未见身份认证。

影响：若服务暴露到非可信网络，调用方可能指定服务账户可访问的任意本地目录并触发后续代理操作。

建议：产品若不仅限于单机可信使用，应增加认证、允许目录根列表、规范化后的子路径校验，并默认仅监听 loopback。若明确定位为单机工具，应在 README 和启动日志中醒目标注安全边界。

### P2：README 的测试数量已过时

README 写的是“全部 24 项测试（7 server + 17 web）”，实际为 25 项（8 server + 17 web）。

建议：避免手工维护易漂移的数量，或同步更新为当前结果。

### P2：前端主包需要持续关注

前端构建主 JS 约 470.78 kB（gzip 144.77 kB），当前未触发 Vite 500 kB 警告，但已接近默认提示阈值。建议后续对非首屏执行面板、动画或历史页面做按路由/组件懒加载，并建立 bundle size 门禁。

## 6. 发布前最低验收清单

1. 修复后端 TypeScript 错误，确保 server/web 构建均通过。
2. 补齐并锁定 Playwright 依赖，提供可重复的 `npm run test:e2e`。
3. 在 CI 中串联：安装、Vitest、server build、web build、E2E、依赖审计。
4. 用可控模型 stub 跑通“创建会话 → 对话 → 显式确认 → 拆解 → 执行 → SSE → 聚合 → 刷新回读”。
5. 在真实 Chromium/Edge 上补测桌面与 375×812 移动端，检查控制台、失败请求、键盘操作和焦点管理。
6. 明确单机/联网部署的安全边界，并限制 workspaceDir。

完成以上 P0 项并补齐一轮真实浏览器验收后，项目才适合进入候选发布阶段。
