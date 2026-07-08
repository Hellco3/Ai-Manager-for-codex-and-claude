// 语言包
const zh = {
  app: { title: 'AI 任务编排器', subtitle: '任务编排平台' },
  home: {
    hero: 'AI 任务编排器',
    powered: '由 Claude + Codex 驱动',
    desc: '描述你的任务，AI 编排器会将其拆解为子任务，分发给 Claude 和 Codex 并行执行，并实时展示进度。',
  },
  form: {
    placeholder: '详细描述你的任务...\n\n示例：创建一个带用户认证的 React 管理面板，包含数据表格（排序/分页）和 WebSocket 实时图表更新。',
    mode: '模式',
    auto: '自动',
    semiAuto: '半自动',
    autoDesc: '全自动拆解并执行',
    semiAutoDesc: '执行前先审核拆解方案',
    execute: '执行任务',
    decomposing: '拆解中...',
    chars: '字符',
    beSpecific: '描述越详细，效果越好',
  },
  progress: {
    title: '任务进度',
    newTask: '新建任务',
    cost: '费用',
    cancel: '取消',
    startNew: '开始新任务',
    running: '运行中',
  },
  stages: {
    decompose: '拆解',
    review: '审核',
    execute: '执行',
    aggregate: '汇总',
  },
  subtask: {
    title: '子任务',
    viewLog: '查看日志',
    noOutput: '暂无输出',
    truncated: '...（已截断）',
    priority: '优先级',
    complexity: '复杂度',
    retries: '重试',
    deps: '依赖',
  },
  review: {
    title: '审核拆解方案',
    reject: '拒绝',
    approve: '确认并执行',
    approving: '确认中...',
    executionOrder: '执行顺序',
    est: '预估',
    min: '分钟',
  },
  stats: {
    costTitle: '费用 & 耗时',
    total: '总计',
    durationTitle: '总耗时',
  },
  status: {
    pending: '待执行',
    queued: '已排队',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    timedOut: '超时',
    cancelled: '已取消',
  },
  error: {
    failed: '执行失败',
    cancelled: '任务已取消',
    timeout: '任务超时',
    allDone: '所有子任务已执行完毕',
  },
  lane: {
    claude: 'Claude 通道',
    codex: 'Codex 通道',
    claudeDesc: '推理 / 研究',
    codexDesc: '构建 / 集成',
    tasks: '任务',
    running: '运行中',
    done: '已完成',
    failed: '失败',
    awaiting: '等待编排...',
    live: '实时执行中',
    stage: '阶段',
    idle: '空闲',
    orchestration: '并行编排',
    lanes: 'Claude 和 Codex 泳道',
  },
  features: [
    { icon: '⚡', title: '智能拆解', desc: 'Claude 智能分析并拆解任务' },
    { icon: '🔄', title: '并行执行', desc: '子任务在 Claude 和 Codex 上并行运行' },
    { icon: '📊', title: '实时进度', desc: '每个子任务的输出实时流式展示' },
  ],
  chat: {
    title: '对话',
    placeholder: '发送跟进消息...',
    send: '发送',
    reconstruct: '重新规划',
    user: '你',
    assistant: '助手',
    system: '系统',
    streaming: '思考中...',
    justNow: '刚刚',
    minutesAgo: '分钟前',
    empty: '暂无消息，发送跟进问题继续对话。',
    error: '发送消息失败',
  },
};

const en: typeof zh = {
  app: { title: 'AI Orchestrator', subtitle: 'Task Orchestration Platform' },
  home: {
    hero: 'AI Task Orchestrator',
    powered: 'Powered by Claude + Codex',
    desc: 'Describe your task, and our AI orchestrator will decompose it into subtasks, distribute them to Claude and Codex, and execute them in parallel with real-time progress tracking.',
  },
  form: {
    placeholder: 'Describe your task in detail...\n\nExample: Create a React dashboard with user authentication, a data table with sorting/pagination, and real-time chart updates via WebSocket.',
    mode: 'Mode',
    auto: 'Auto',
    semiAuto: 'Semi-Auto',
    autoDesc: 'Fully automatic decomposition and execution',
    semiAutoDesc: 'Review and approve decomposition before execution',
    execute: 'Execute Task',
    decomposing: 'Decomposing...',
    chars: 'characters',
    beSpecific: 'Be specific for best results',
  },
  progress: {
    title: 'Task Progress',
    newTask: 'New Task',
    cost: 'Cost',
    cancel: 'Cancel',
    startNew: 'Start New Task',
    running: 'Running',
  },
  stages: {
    decompose: 'Decompose',
    review: 'Review',
    execute: 'Execute',
    aggregate: 'Aggregate',
  },
  subtask: {
    title: 'Subtasks',
    viewLog: 'View Log',
    noOutput: 'No output yet',
    truncated: '... (truncated)',
    priority: 'Priority',
    complexity: 'Complexity',
    retries: 'Retries',
    deps: 'Deps',
  },
  review: {
    title: 'Review Decomposition',
    reject: 'Reject',
    approve: 'Approve & Execute',
    approving: 'Approving...',
    executionOrder: 'Execution order',
    est: 'est.',
    min: 'min',
  },
  stats: {
    costTitle: 'Cost & Duration',
    total: 'Total',
    durationTitle: 'Total Duration',
  },
  status: {
    pending: 'Pending',
    queued: 'Queued',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    timedOut: 'Timed Out',
    cancelled: 'Cancelled',
  },
  error: {
    failed: 'Execution Failed',
    cancelled: 'Task cancelled by user',
    timeout: 'Task timed out',
    allDone: 'All subtasks have been executed successfully',
  },
  lane: {
    claude: 'Claude Lane',
    codex: 'Codex Lane',
    claudeDesc: 'reasoning / research',
    codexDesc: 'build / integration',
    tasks: 'tasks',
    running: 'running',
    done: 'done',
    failed: 'failed',
    awaiting: 'awaiting orchestration...',
    live: 'Execution Live',
    stage: 'stage',
    idle: 'Idle',
    orchestration: 'Parallel Orchestration',
    lanes: 'Claude and Codex swimlanes',
  },
  features: [
    { icon: '⚡', title: 'Auto Decomposition', desc: 'Claude analyzes and breaks down tasks intelligently' },
    { icon: '🔄', title: 'Parallel Execution', desc: 'Subtasks run concurrently on Claude & Codex' },
    { icon: '📊', title: 'Real-time Progress', desc: 'Live streaming of every subtask\'s output' },
  ],
  chat: {
    title: 'Conversation',
    placeholder: 'Send a follow-up message...',
    send: 'Send',
    reconstruct: 'Re-plan',
    user: 'You',
    assistant: 'Assistant',
    system: 'System',
    streaming: 'Thinking...',
    justNow: 'just now',
    minutesAgo: 'm ago',
    empty: 'No messages yet. Ask a follow-up question to continue.',
    error: 'Failed to send message',
  },
};

// 从 .env 的 LANGUAGE 变量或浏览器语言检测
function detectLanguage(): 'zh' | 'en' {
  if (typeof window !== 'undefined') {
    // 检查 URL 参数
    const params = new URLSearchParams(window.location.search);
    if (params.get('lang') === 'zh') return 'zh';
    if (params.get('lang') === 'en') return 'en';
    // 检查浏览器语言
    if (navigator.language.startsWith('zh')) return 'zh';
  }
  // 默认通过环境变量，fallback 到中文
  return 'zh';
}

const lang = detectLanguage();
export const t = lang === 'zh' ? zh : en;
export const langName = lang;
