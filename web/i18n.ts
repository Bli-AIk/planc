export type Locale = 'zh' | 'en';

const messages = {
  zh: {
    taskbook: '任务书', readonly: '只读', connecting: '连接中', connected: '已连接', synced: '已同步', invalid: '更新无效', disconnected: '连接中断',
    localHistory: '本地历史', closeHistory: '关闭历史', topicGraphs: '主题图', tasks: '任务', searchTasks: '搜索任务', taskList: '任务列表', localRecord: '本地记录', noCommits: '暂无提交', localCommit: '本地提交',
    planGraph: '计划图', hiddenItems: '查看隐藏项', hiddenPrereqs: '查看隐藏前置', dependencyGraph: '任务依赖图', noTasks: '暂无任务', noVisibleTasks: '暂无可见任务', viewport: '图视口', zoomIn: '放大', zoomOut: '缩小', fit: '适应图形',
    completed: '已完成', inProgress: '进行中', ready: '已就绪', blocked: '未就绪', notStarted: '未开始', taskDetails: '任务详情', resizeInspector: '调整详情面板宽度', dragResizeInspector: '拖动调整详情面板宽度', overview: '主题概览', closeDetails: '关闭任务详情', detailView: '详情视图',
    goal: '目标', criteria: '完成依据', prerequisites: '前置条件', noPrerequisites: '无前置条件', related: '普通关联', completionRecord: '完成记录', currentConcern: '当前疑点', noNotes: '暂无关联笔记', noChecks: '暂无检查记录', userNotes: '用户笔记', agentNotes: 'Agent 指引', discussion: '讨论材料', checks: '检查', task: '任务', overviewTab: '概览',
    userConfirmed: '用户确认完成', checked: '经检查确认', needsReview: '待核查疑点', dissent: '保留意见', currentTasks: '当前任务', noMatchingTasks: '暂无匹配任务', changes: '结构调整', note: '笔记', language: 'EN', languageTitle: 'Switch to English',
    updateInvalid: '更新无效，保留上一次有效视图。', planUnreadable: '计划暂不可读。', cannotDisplay: '无法显示更新：',
  },
  en: {
    taskbook: 'Plan', readonly: 'Read-only', connecting: 'Connecting', connected: 'Connected', synced: 'Synced', invalid: 'Invalid update', disconnected: 'Disconnected',
    localHistory: 'Local history', closeHistory: 'Close history', topicGraphs: 'Topic graphs', tasks: 'Tasks', searchTasks: 'Search tasks', taskList: 'Task list', localRecord: 'Local record', noCommits: 'No commits', localCommit: 'local commit',
    planGraph: 'Plan graph', hiddenItems: 'Show hidden items', hiddenPrereqs: 'Show hidden prerequisites', dependencyGraph: 'Task dependency graph', noTasks: 'No tasks', noVisibleTasks: 'No visible tasks', viewport: 'Graph viewport', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit graph',
    completed: 'Completed', inProgress: 'In progress', ready: 'Ready', blocked: 'Blocked', notStarted: 'Not started', taskDetails: 'Task details', resizeInspector: 'Resize details panel', dragResizeInspector: 'Drag to resize details panel', overview: 'Topic overview', closeDetails: 'Close task details', detailView: 'Detail view',
    goal: 'Goal', criteria: 'Completion criteria', prerequisites: 'Prerequisites', noPrerequisites: 'No prerequisites', related: 'Related', completionRecord: 'Completion record', currentConcern: 'Current concern', noNotes: 'No linked notes', noChecks: 'No checks', userNotes: 'User notes', agentNotes: 'Agent guidance', discussion: 'Discussion', checks: 'Checks', task: 'Task', overviewTab: 'Overview',
    userConfirmed: 'User confirmed completion', checked: 'Confirmed by review', needsReview: 'Needs review', dissent: 'Dissent', currentTasks: 'Current tasks', noMatchingTasks: 'No matching tasks', changes: 'Structural changes', note: 'Note', language: '中文', languageTitle: '切换到简体中文',
    updateInvalid: 'Invalid update; keeping the last valid view.', planUnreadable: 'Plan is not readable.', cannotDisplay: 'Could not display update: ',
  },
} as const;

export type MessageKey = keyof typeof messages.zh;
const requested = new URLSearchParams(location.search).get('lang')?.toLowerCase();
const stored = localStorage.getItem('planc.locale')?.toLowerCase();
const preferred = [requested, stored, navigator.language.toLowerCase()].find(value => value === 'zh' || value === 'en' || value?.startsWith('zh')) ?? 'en';
export let locale: Locale = preferred.startsWith('zh') ? 'zh' : 'en';
export const t = (key: MessageKey) => messages[locale][key];
export function toggleLocale() { locale = locale === 'zh' ? 'en' : 'zh'; localStorage.setItem('planc.locale', locale); document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; }
