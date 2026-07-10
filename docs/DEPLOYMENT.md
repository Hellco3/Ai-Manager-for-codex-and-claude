# 本地部署指南

## 导航

- [准备运行环境](#prerequisites)
- [下载项目](#download)
- [安装依赖](#install)
- [配置 Claude、Codex 和模型代理](#configuration)
- [启动模型代理](#proxy)
- [本地开发部署](#local-development)
- [第一次功能验证](#first-verification)
- [自动化验证](#automated-verification)
- [数据与备份](#data-backup)
- [常见问题](#troubleshooting)
- [安全提醒](#security)

本指南仅介绍本机开发部署。项目使用 localhost 前端界面操作，但不作为公网 Web 服务发布；请勿直接对外暴露前端、后端或模型代理端口。

<a id="prerequisites"></a>

## 1. 准备运行环境

需要安装：

- **Git**：用于下载项目。
- **Node.js 22 LTS**：项目使用 npm workspaces，建议配套 npm 10 或更高版本。
- **Claude Code CLI**：代码子任务会通过它实际读写工作区。
- **Codex CLI 0.143+**：读图和生图子任务使用它执行。
- **CCSwitch 或兼容 Anthropic API 的代理**：默认地址为 `http://127.0.0.1:15721`。
- **Microsoft Edge 或 Playwright 浏览器**：仅运行 E2E 测试时需要。

安装完成后打开 PowerShell、Terminal 或其他命令行，检查版本：

```bash
git --version
node --version
npm --version
claude --version
codex --version
```

如果 `claude` 或 `codex` 提示“找不到命令”，请重新打开终端，并确认 CLI 所在目录已加入 `PATH`。

<a id="download"></a>

## 2. 下载项目

如果已经在本项目目录中，可以跳过本步骤。

```bash
git clone <你的仓库地址> ai_manager
cd ai_manager
```

后续所有命令都应在包含根目录 `package.json` 的 `ai_manager` 目录中执行。

<a id="install"></a>

## 3. 安装项目依赖

首次安装建议使用锁文件进行可重复安装：

```bash
npm ci
```

如果正在修改依赖或 `npm ci` 提示锁文件不一致，可改用：

```bash
npm install
```

根目录是 npm workspace，以上命令会同时安装 `shared`、`server` 和 `web` 的依赖，不需要逐个目录安装。

<a id="configuration"></a>

## 4. 配置 Claude、Codex 和模型代理

先复制环境变量模板。

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS/Linux：

```bash
cp .env.example .env
```

打开 `.env`，最小配置如下：

```dotenv
LANGUAGE=zh

# CCSwitch 或兼容 Anthropic API 的代理
ANTHROPIC_BASE_URL=http://127.0.0.1:15721
ANTHROPIC_AUTH_TOKEN=PROXY_MANAGED

# 对话、拆解、分析和 Claude Code 使用的模型
DECOMPOSER_MODEL=claude-opus-4-8
EXECUTOR_MODEL=claude-sonnet-5

# CLI 路径
CLAUDE_CODE_CLI_PATH=claude
CODEX_CLI_PATH=codex

# 单机部署建议仅监听本机
HOST=127.0.0.1
PORT=3001
```

说明：

- 默认配置假设 CCSwitch 已在本机 15721 端口运行，并能识别上述模型名。
- 如果使用官方 Anthropic API，请把 `ANTHROPIC_BASE_URL`、认证令牌和模型名改为服务商实际配置；不要提交包含真实密钥的 `.env`。
- `CODEX_MODEL` 默认不设置，此时沿用 `~/.codex/config.toml` 中的本机 Codex 模型。
- 代码任务使用 Claude Code CLI；请确保它在当前终端中可运行并已完成认证或代理配置。
- 读图/生图使用 Codex CLI；请先按 Codex CLI 的认证方式完成登录。可以运行 `codex --version` 验证程序存在，并用一个独立的简单任务验证账户可用。
- 生图还要求当前 Codex 环境实际提供 imagegen 能力；否则视觉生成子任务会明确失败，不会静默改由 Claude 执行。

<a id="proxy"></a>

## 5. 启动 CCSwitch 或模型代理

先启动 CCSwitch，再检查端口是否可访问。Windows PowerShell 示例：

```powershell
Test-NetConnection 127.0.0.1 -Port 15721
```

看到 `TcpTestSucceeded : True` 后再启动本项目。如果使用其他代理地址，请同步修改 `.env` 中的 `ANTHROPIC_BASE_URL`。

<a id="local-development"></a>

## 6. 本地开发部署

一条命令同时启动后端和前端：

```bash
npm run dev
```

默认地址：

- 聊天首页：<http://localhost:5173>
- 传统提交页：<http://localhost:5173/submit>
- 后端健康检查：<http://127.0.0.1:3001/health>

健康检查应返回类似内容：

```json
{
  "status": "ok"
}
```

Vite 会把开发环境中的 `/api` 请求代理到 `http://localhost:3001`。不要只启动前端，否则会话、上传和 SSE 请求都会失败。

也可以分别启动，便于排查日志：

```bash
npm run dev:server
npm run dev:web
```

请在两个独立终端中执行以上命令。

<a id="first-verification"></a>

## 7. 第一次功能验证

1. 打开 <http://localhost:5173>。
2. 选择一个允许 Claude Code/Codex 修改的测试工作目录，不要直接选择包含重要文件的目录。
3. 输入一个简单需求，例如“在测试目录创建一个 hello.txt，并写入 Hello”。
4. 与主代理确认需求后，点击“开始任务”或输入“开始执行”。
5. 确认顶部状态、耗时计时器和 Claude/Codex 泳道持续更新。
6. 完成后检查工作目录和页面交付文件区域。

建议第一次不要直接测试大型 DOCX、生图或长时间任务，先确认基础代码落盘链路正常。

<a id="automated-verification"></a>

## 8. 运行自动化验证

```bash
# server + web 单元/组件测试
npm test

# 生产构建
npm run build

# 浏览器 E2E；配置会自动启动 Vite
npm run test:e2e
```

E2E 默认使用本机 Microsoft Edge。如果 CI 或服务器没有 Edge，可安装 Playwright Chromium，并在 `tests/e2e/playwright.config.ts` 中移除或调整 `channel: 'msedge'`：

```bash
npx playwright install chromium
```

<a id="data-backup"></a>

## 9. 数据目录与备份

- 会话数据：`server/data/sessions.json`
- 上传及导入的交付文件：`server/uploads/`
- 本地构建产物：`server/dist/`、`web/dist/`，可随时重新生成，无需备份

停止服务后再备份数据目录，可避免复制到写入一半的 JSON。附件索引当前主要保存在运行时内存中，因此服务重启后应特别检查历史附件可用性。

<a id="troubleshooting"></a>

## 10. 常见问题

#### 页面可以打开，但所有 API 都失败

- 确认后端 3001 端口正在监听。
- 开发环境确认使用 `npm run dev`，而不是只运行 Vite。
- 确认访问的是 `http://localhost:5173`，并检查 Vite 的本地 `/api` 代理配置。

#### `AI 服务响应超时` 或拆解一直不动

- 检查 CCSwitch/代理是否运行。
- 检查 `.env` 中的 URL、令牌和模型名。
- 直接访问 `/health` 只能证明后端运行，不代表模型代理一定可用。

#### 代码任务只返回文本，没有修改文件

- 运行 `claude --version`。
- 确认 `CLAUDE_CODE_CLI_PATH` 正确。
- 确认所选工作目录存在，且启动服务的用户有写权限。
- 查看服务端日志中是否出现 `Executing code subtask via Claude Code CLI`。

#### Codex 读不到图片或无法生图

- 运行 `codex --version` 并检查认证状态。
- 确认任务被拆成 `vision` 或 `image_generation` 类型。
- 确认上传图片状态为 `ready`。
- 生图需要 Codex 环境提供 imagegen 能力；本项目不会在 Codex 失败后改由 Claude 生图。

#### E2E 提示找不到浏览器

```bash
npx playwright install chromium
```

如果仍使用 `channel: 'msedge'`，还需要安装 Microsoft Edge，或者修改 Playwright 配置使用 Chromium。

#### 端口被占用

- 后端端口可通过 `.env` 中的 `PORT` 修改。
- 前端端口在 `web/vite.config.ts` 中配置。
- 修改后端端口后，还需要同步调整 Vite 的本地代理配置。

<a id="security"></a>

## 11. 本地安全提醒

本项目可以启动 Claude Code 和 Codex 修改指定工作目录，权限等同于运行服务的操作系统用户。项目只面向本机开发，不具备公网服务所需的身份认证和租户隔离能力。

必须使用本机监听：

```dotenv
HOST=127.0.0.1
```

同时建议：

- 不要在路由器、防火墙或云安全组中开放 3001、5173 和模型代理端口。
- 只选择专门的测试工作目录，不要把用户主目录、系统目录或含敏感资料的目录交给代理。
- 使用普通用户权限运行，不要使用管理员/root 权限。
- 将 `.env`、会话数据和上传文件保留在本机，提交前用 `git status --ignored` 复核。
- 如果未来需要团队或公网访问，应另行设计认证、HTTPS、工作目录白名单、隔离执行环境、审计和资源限额；当前版本不支持该场景。
