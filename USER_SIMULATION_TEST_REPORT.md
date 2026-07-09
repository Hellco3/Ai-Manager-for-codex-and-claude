# 用户模拟测试报告

日期：2026-07-10  
项目：`ai_manager`  
测试人：Codex

## 测试目标

对当前项目进行一轮近似真实用户的主路径模拟测试，重点验证以下流程：

1. 首页是否可正常访问
2. `chat-first` 模式是否可创建会话
3. 用户发送首条消息后，系统是否正确进入聊天态
4. 用户点击“开始任务”后，系统是否正确进入拆解/执行态
5. 会话数据、消息、成本信息是否能正确保存在后端并通过接口返回

## 测试环境

- 前端：`http://localhost:5173`
- 后端：`http://127.0.0.1:3001`
- 测试方式：
  - 本地真实启动前后端服务
  - 通过 HTTP 请求模拟用户主路径
  - 通过 `/api/tasks/:id` 拉取会话状态验证结果

说明：
本次没有完成“浏览器内点击式”的可视化测试，因为当前会话里内置浏览器后端不可用；因此这份报告属于“真实接口链路 + 用户流程 smoke test”。

## 测试结果概览

- 首页可正常访问：通过
- 后端健康检查：通过
- `chat-first` 会话创建：通过
- 聊天消息收发：通过
- 点击“开始任务”后进入拆解/执行：通过
- 成本信息持久化：失败
- 部分中文/提示词字符串编码质量：失败

## 已验证通过的用户路径

### 1. 首页访问

- 访问：`http://localhost:5173`
- 结果：返回 `200`

### 2. 后端健康检查

- 访问：`http://127.0.0.1:3001/health`
- 结果：返回 `status: ok`

### 3. 创建 chat-first 会话

请求：

```json
POST /api/tasks
{
  "task": "Create a tiny smoke-test session for user simulation",
  "mode": "chat-first"
}
```

结果：

```json
{
  "sessionId": "652ad856-5d0a-48d8-9435-5f173865be07",
  "status": "chatting",
  "workspaceDir": null
}
```

### 4. 发送消息后进入聊天态

- 会话创建成功后，消息被写入 `messages`
- 助手回复成功生成
- `/api/tasks/:id` 能查询到消息历史

### 5. 点击“开始任务”后进入执行流程

请求：

```json
POST /api/sessions/:id/confirm
{
  "task": "Please create a smoke-test plan for the app",
  "workspaceDir": "E:\\Code\\ai_manager"
}
```

结果：

- 状态先进入 `decomposing`
- 随后进入 `executing`
- `decomposition` 已生成
- `subtaskStates` 开始推进

说明：
这说明从“聊天确认需求”到“正式拆解执行”的主链路是通的。

## 发现的问题

### 问题 1：`costStats` 没有持久化到会话，刷新后成本信息会丢

优先级：高

现象：

- `orchestrator` 在拆解阶段和执行阶段都会广播 `cost:update`
- 但是这些成本统计没有同步写入 `sessionStore`
- `/api/tasks/:id` 返回的是 `session.costStats`
- 因此用户刷新页面或重新拉取会话时，成本面板可能为空或不完整

定位：

- [server/src/services/orchestrator.ts:100](E:/Code/ai_manager/server/src/services/orchestrator.ts:100)
- [server/src/services/orchestrator.ts:309](E:/Code/ai_manager/server/src/services/orchestrator.ts:309)
- [server/src/store/session-store.ts:241](E:/Code/ai_manager/server/src/store/session-store.ts:241)

原因判断：

- 当前逻辑只做了 `sseManager.broadcast(sessionId, { type: 'cost:update', stats })`
- 但没有调用 `sessionStore.addCostStats(...)` 或等价的会话写入逻辑

建议修复：

1. 每次得到 `stats` 后，同时写入 `sessionStore`
2. 注意不要简单重复追加导致同一模型重复叠加错误
3. 更好的方式是提供一个“按 model 覆盖/更新”的会话成本写入方法，而不是无限 `push`

建议方向：

- 在 `SessionStore` 增加 `upsertCostStats(sessionId, stats)` 方法
- `orchestrator` 每次广播 `cost:update` 前后都调用它

---

### 问题 2：`orchestrator.ts` 内已有多处乱码字符串

优先级：高

现象：

- 文件中已经混入多处乱码中文
- 这些字符串出现在：
  - 继续对话时拼接的 `contextTask`
  - 聊天提示词 `system prompt`
  - 计划总结 `planSummary`
  - 超时/错误文案

定位示例：

- [server/src/services/orchestrator.ts:461](E:/Code/ai_manager/server/src/services/orchestrator.ts:461)
- [server/src/services/orchestrator.ts:475](E:/Code/ai_manager/server/src/services/orchestrator.ts:475)
- [server/src/services/orchestrator.ts:568](E:/Code/ai_manager/server/src/services/orchestrator.ts:568)
- [server/src/services/orchestrator.ts:579](E:/Code/ai_manager/server/src/services/orchestrator.ts:579)
- [server/src/services/orchestrator.ts:640](E:/Code/ai_manager/server/src/services/orchestrator.ts:640)
- [server/src/services/orchestrator.ts:666](E:/Code/ai_manager/server/src/services/orchestrator.ts:666)

影响：

- 提示词质量下降，可能导致模型理解偏差
- 用户可见消息可能出现乱码
- 后续维护人员难以继续安全修改

建议修复：

1. 统一把这些乱码字符串替换成明确的 UTF-8 中文
2. 检查文件保存编码，确保仓库统一为 UTF-8
3. 顺手排查其他中文文档/代码文件是否存在同类问题

---

### 问题 3：前端访问地址存在一个轻微环境风险

优先级：低

现象：

- 本次环境中 Vite 监听在 `::1:5173`
- `http://localhost:5173` 可访问
- `http://127.0.0.1:5173` 不可访问

影响：

- 如果有脚本、文档或用户习惯固定使用 `127.0.0.1:5173`，可能误以为前端没启动

建议修复：

- 可选，不是必须
- 如果希望更稳定，Vite 可以明确监听 `0.0.0.0` 或 `localhost`
- 同时 README 里建议统一写一个可用地址

## 对 Claude 的直接修改建议

如果要请 Claude 直接改代码，建议按这个顺序：

1. 先修 `server/src/services/orchestrator.ts` 里的乱码字符串
2. 再修 `costStats` 的持久化问题
3. 最后补一条测试，验证：
   - 成本更新后 `/api/tasks/:id` 能返回非空 `costStats`
   - 继续会话/确认执行时不会再生成乱码文本

可以直接给 Claude 的任务说明：

> 请修复 `ai_manager` 中用户模拟测试发现的两个问题：  
> 1. `server/src/services/orchestrator.ts` 中存在多处乱码中文字符串，请统一修复为正常 UTF-8 中文；  
> 2. `cost:update` 只做了 SSE 广播，没有把成本统计持久化进 `sessionStore`，导致刷新后成本数据丢失。请实现会话级成本统计写回，并补测试验证 `/api/tasks/:id` 返回的 `costStats` 正确。

## 结论

当前项目的核心主链路已经能跑通：

- 能创建 chat-first 会话
- 能聊天
- 能确认并开始拆解执行

但在“数据持久化一致性”和“字符串编码质量”上存在明显问题，建议优先修复后再做下一轮用户测试。
