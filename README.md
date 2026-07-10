# 🎻 Conductor — 多智能体 AI 任务编排平台

> 像乐队指挥一样调度 Claude 与 Codex，将复杂任务拆解、分发、并行执行、聚合交付。

## 这是什么

Conductor 是一个 **AI 任务编排器**。你只需用自然语言描述一个任务，它就会：

1. **🧠 智能拆解** — Claude 分析任务，自动生成 DAG 依赖子任务图
2. **⚡ 并行执行** — 代码类子任务交给 Claude Code CLI，分析/设计类交给 Claude API，最大 5 路并发
3. **🏊 实时可视化** — 双泳道进度面板，每个子任务的输出以 SSE 流式推送
4. **📦 结果聚合** — 自动汇总所有子任务产出，生成交付文件清单，支持一键下载
5. **💬 多轮对话** — 支持在执行前后进行多轮澄清和迭代，**仅在用户确认后才执行**

## 亮点

| 特性 | 说明 |
|------|------|
| 🔑 **零配置** | 复用 Claude Code 的 CCSwitch 代理，无需 API Key |
| 🌐 **中文优先** | 完整中/英双语界面，浏览器自动检测 |
| 📡 **实时流** | Server-Sent Events 推送每个子任务的执行进度 |
| 💰 **成本透明** | 按模型统计 token 消耗与费用 |
| 🧪 **E2E 覆盖** | Vitest 单元/组件测试 + Playwright 浏览器 E2E |
| 📱 **响应式** | 桌面端双栏 + 移动端底部抽屉 |

## 架构

```
用户输入任务 → POST /api/tasks (chat-first)
  → Orchestrator 状态机
    → Decomposer（Claude 拆解 → DAG 子任务图）
    → Executor（依赖解析 + 最大 5 并发）
      → Code 子任务 → Claude Code CLI spawn
      → Analysis/Design 子任务 → Claude API 流式
    → Aggregator（汇总结果 + 扫描交付文件）
  → SSE 广播 → 前端 PipelineView + SwimLaneView
```

## 快速开始

```bash
git clone https://github.com/Hellco3/Ai-Conductor-for-codex-and-claude.git
cd Conductor
npm ci
cp .env.example .env
npm run dev          # 后端 :3001 + 前端 :5173
```

浏览器访问 <http://localhost:5173>，健康检查 <http://127.0.0.1:3001/health>。

## 命令

```bash
npm run dev          # 启动开发服务器
npm test             # 全部测试
npm run test:server  # 服务端测试
npm run test:web     # 前端测试
npm run test:e2e     # Playwright E2E 测试
npm run build        # 生产构建
```

[完整部署文档 →](./docs/DEPLOYMENT.md)

## 技术栈

React 19 · TypeScript · Express 5 · Zustand · Framer Motion · Tailwind CSS 4 · SSE · Zod · Vitest · Playwright · pino

## License

MIT
