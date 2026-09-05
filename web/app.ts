import MarkdownIt from 'markdown-it';
import { createIcons, Workflow, Eye, History, Search, GitCommitHorizontal, ListTodo, Plus, Minus, Scan, CircleCheck, CircleDot, Circle, LockKeyhole, X, Network, FileText, ArrowUpRight, ArrowRight, MessageSquare, GitBranch } from 'lucide';
import { TaskGraph, isVisible } from './graph';
import type { Task, Graph, Check, Payload, Snapshot, Commit } from './types';

const icons = { Workflow, Eye, History, Search, GitCommitHorizontal, ListTodo, Plus, Minus, Scan, CircleCheck, CircleDot, Circle, LockKeyhole, X, Network, FileText, ArrowUpRight, ArrowRight, MessageSquare, GitBranch };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const refreshIcons = () => createIcons({ icons });
const kindNames = { implementation: '实现', understanding: '理解', investigation: '调查', decision: '决策' };
const time = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
let snapshot: Snapshot | null = null;
let graphId: string | null = null;
let selected: string | null = null;
let tab: 'task' | 'notes' | 'checks' = 'task';
let selectedNote: string | null = null;
let invalid = false;
let commits: Commit[] = [];
const showAll = $('show-all') as HTMLInputElement;
const showImplicit = $('show-implicit') as HTMLInputElement;
const search = $('search') as HTMLInputElement;
const graphView = new TaskGraph($('graph'), id => selectTask(id));

function currentGraph(): Graph | undefined { return snapshot?.plan.graphs.find(g => g.id === graphId); }
function stateOf(task: Task) { return task.status === 'not_started' ? task.readiness.ready ? 'ready' : 'blocked' : task.status; }
function statusIcon(task: Task) { return { completed: 'circle-check', in_progress: 'circle-dot', ready: 'circle', blocked: 'lock-keyhole' }[stateOf(task)]; }
function statusName(task: Task) { return { completed: '已完成', in_progress: '进行中', ready: '已就绪', blocked: '未就绪' }[stateOf(task)]; }
function badge(task: Task) { return `<span class="status-badge ${stateOf(task)}">${icon(statusIcon(task))}${statusName(task)}</span>`; }
function taskButton(task: Task) { return `<button class="task-link" data-task="${esc(task.id)}" aria-current="${task.id === selected}"><span class="${stateOf(task)}">${icon(statusIcon(task))}</span><span>${esc(task.title)}</span></button>`; }
function displayedTasks() { const members = new Set(currentGraph()?.taskIds); return snapshot?.plan.tasks.filter(t => members.has(t.id) && isVisible(t, showAll.checked)) ?? []; }
function selectTask(id: string, jump = false) {
  if (!snapshot) return;
  const task = snapshot.plan.tasks.find(t => t.id === id);
  if (!task) return;
  if (!currentGraph()?.taskIds.includes(id)) graphId = snapshot.plan.graphs.find(g => g.taskIds.includes(id))?.id ?? graphId;
  if (!isVisible(task, showAll.checked)) showAll.checked = true;
  selected = id; tab = 'task'; selectedNote = null;
  render();
  if (jump) graphView.focus(id);
}
function renderSidebar() {
  if (!snapshot) return;
  $('graph-count').textContent = String(snapshot.plan.graphs.length);
  $('graphs').innerHTML = snapshot.plan.graphs.map(g => `<button class="graph-link" data-graph="${esc(g.id)}" aria-current="${g.id === graphId}">${icon('network')}<span>${esc(g.title)}</span><small>${g.taskIds.length}</small></button>`).join('');
  $('task-count').textContent = String(currentGraph()?.taskIds.length ?? 0);
  const query = search.value.toLocaleLowerCase();
  const tasks = displayedTasks().filter(t => `${t.id} ${t.title}`.toLocaleLowerCase().includes(query));
  $('task-list').innerHTML = tasks.length ? tasks.map(taskButton).join('') : '<p class="quiet">暂无匹配任务</p>';
}
function renderGraph() {
  if (!snapshot) return;
  const graph = currentGraph(); const visible = displayedTasks();
  $('graph-title').textContent = graph?.title ?? '暂无主题图';
  $('visible-count').textContent = `${visible.length} / ${graph?.taskIds.length ?? 0}`;
  $('graph-empty').hidden = visible.length > 0;
  $('graph-empty').querySelector('p')!.textContent = graph?.taskIds.length ? '暂无可见任务' : '暂无任务';
  $('updated-at').textContent = time(snapshot.plan.updatedAt);
  graphView.update(snapshot.plan, graph, selected, showAll.checked, showImplicit.checked);
}
function dependency(id: string, implicit = false) {
  const task = snapshot!.plan.tasks.find(t => t.id === id)!;
  const home = snapshot!.plan.graphs.find(g => g.taskIds.includes(id));
  const crossGraph = !currentGraph()?.taskIds.includes(id);
  return `<button class="dependency" data-jump="${esc(id)}"><span class="${stateOf(task)}">${icon(statusIcon(task))}</span><span class="dep-body">${esc(task.title)}<small>${esc(task.id)}${implicit ? ' · 隐式前置' : ''}${crossGraph ? ` · ${esc(home?.title)}` : ''}</small></span>${icon(crossGraph ? 'arrow-up-right' : 'arrow-right')}</button>`;
}
function renderCheck(check: Check) {
  return `<div class="record"><div class="record-header"><span>${check.kind === 'user_confirmation' ? '用户确认完成' : check.outcome === 'completed' ? '经检查确认' : '待核查疑点'}</span><time>${esc(time(check.at))}</time></div><p>${esc(check.summary)}</p><ul>${check.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>${check.dissent ? `<div class="dissent"><strong>保留意见</strong><p>${esc(check.dissent)}</p></div>` : ''}</div>`;
}
function renderTask(task: Task) {
  const prereqs = snapshot!.plan.relations.filter(r => r.type === 'prerequisite' && r.to === task.id);
  const related = snapshot!.plan.relations.filter(r => r.type === 'related' && (r.from === task.id || r.to === task.id));
  const completion = snapshot!.plan.checks.find(c => c.id === task.completion?.checkId);
  const latest = snapshot!.plan.checks.filter(c => c.taskId === task.id).at(-1);
  return `<section class="detail-section"><h3>目标</h3><p>${esc(task.goal)}</p></section>
    <section class="detail-section"><h3>完成依据</h3><ol class="criteria">${task.completionCriteria.map(c => `<li>${esc(c)}</li>`).join('')}</ol></section>
    <section class="detail-section"><h3>前置条件 · ${prereqs.length}</h3>${prereqs.length ? prereqs.map(r => dependency(r.from, r.implicit)).join('') : '<p class="quiet">无前置条件</p>'}</section>
    ${related.length ? `<section class="detail-section"><h3>普通关联</h3>${related.map(r => dependency(r.from === task.id ? r.to : r.from)).join('')}</section>` : ''}
    ${completion ? `<section class="detail-section"><h3>完成记录</h3>${renderCheck(completion)}</section>` : ''}
    ${latest && latest.outcome === 'needs_work' && latest.id !== completion?.id ? `<section class="detail-section"><h3>当前疑点</h3>${renderCheck(latest)}</section>` : ''}`;
}
function renderMarkdown(name: string) {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
  const defaultLink = md.renderer.rules.link_open || ((tokens, idx, options, _env, renderer) => renderer.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, renderer) => {
    const token = tokens[idx]; const href = token.attrGet('href') || '';
    if (/^(https?:|mailto:)/i.test(href)) { token.attrSet('target', '_blank'); token.attrSet('rel', 'noopener noreferrer'); }
    else {
      try {
        const url = new URL(href, `https://notes.invalid/${name}`);
        const linkedNote = decodeURIComponent(url.pathname.slice(1));
        if (url.origin === 'https://notes.invalid' && Object.hasOwn(snapshot!.notes, linkedNote)) token.attrSet('href', `#note=${encodeURIComponent(linkedNote)}`);
        else token.attrSet('href', '#');
      } catch { token.attrSet('href', '#'); }
    }
    return defaultLink(tokens, idx, options, env, renderer);
  };
  // Notes cannot fetch remote images or reach arbitrary project files.
  md.renderer.rules.image = (tokens, idx) => esc(tokens[idx].content);
  return md.render(snapshot!.notes[name]);
}
function renderNotes(names: string[]) {
  if (!names.length) return '<p class="quiet">暂无关联笔记</p>';
  if (!selectedNote || !Object.hasOwn(snapshot!.notes, selectedNote)) selectedNote = names[0];
  return `<nav class="note-switch" aria-label="关联笔记">${[...new Set([...names, selectedNote])].map(name => `<button data-note="${esc(name)}" aria-current="${name === selectedNote}">${icon('file-text')}${esc(name.replace(/^notes\//, ''))}</button>`).join('')}</nav><div class="markdown">${renderMarkdown(selectedNote)}</div>`;
}
function renderDetail() {
  if (!snapshot) return;
  const content = $('detail-content'); const scroll = content.scrollTop;
  const task = snapshot.plan.tasks.find(t => t.id === selected); const graph = currentGraph();
  $('clear-selection').hidden = !task;
  $('detail-label').textContent = task ? `${kindNames[task.kind]} · ${task.id}` : '主题概览';
  $('detail-title').innerHTML = task ? `<h2>${esc(task.title)}</h2><div class="task-meta">${badge(task)}<span>${kindNames[task.kind]}</span>${task.status === 'not_started' ? '<span>未开始</span>' : ''}</div>` : `<h2>${esc(graph?.title ?? snapshot.plan.title)}</h2><div class="task-meta"><span>${graph?.taskIds.length ?? 0} 个任务</span><span>${graph?.notes.length ?? 0} 份讨论笔记</span></div>`;
  const tabs = task ? [['task', '任务'], ['notes', `笔记 ${task.notes.length}`], ['checks', `检查 ${snapshot.plan.checks.filter(c => c.taskId === task.id).length}`]] : [['task', '概览'], ['notes', '讨论笔记']];
  if (!task && tab === 'checks') tab = 'task';
  $('detail-tabs').innerHTML = tabs.map(([id, title]) => `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${title}</button>`).join('');
  if (tab === 'notes') content.innerHTML = renderNotes(task?.notes ?? graph?.notes ?? []);
  else if (tab === 'checks' && task) content.innerHTML = snapshot.plan.checks.filter(c => c.taskId === task.id).slice().reverse().map(renderCheck).join('') || '<p class="quiet">暂无检查记录</p>';
  else if (task) content.innerHTML = renderTask(task);
  else content.innerHTML = `<section class="detail-section"><h3>当前任务</h3>${displayedTasks().map(taskButton).join('') || '<p class="quiet">暂无可见任务</p>'}</section>${graph?.notes.length ? `<section class="detail-section"><h3>讨论材料</h3>${renderNotes(graph.notes)}</section>` : ''}`;
  content.scrollTop = scroll;
}
function render() {
  if (!snapshot) return;
  $('project-title').textContent = snapshot.plan.title; document.title = `${snapshot.plan.title} · planc`;
  renderSidebar(); renderGraph(); renderDetail(); refreshIcons();
}
function receive(payload: Payload) {
  invalid = !payload.ok;
  if (payload.snapshot && payload.snapshot.revision !== snapshot?.revision) {
    snapshot = payload.snapshot;
    if (!snapshot.plan.graphs.some(g => g.id === graphId)) graphId = snapshot.plan.graphs[0]?.id ?? null;
    if (!snapshot.plan.tasks.some(t => t.id === selected)) selected = null;
    render(); void loadHistory();
  }
  $('error').hidden = payload.ok;
  $('error').textContent = payload.ok ? '' : `${snapshot ? '更新无效，保留上一次有效视图。' : '计划暂不可读。'}\n${(payload.errors ?? []).join('\n')}`;
  $('connection').textContent = invalid ? '更新无效' : '已同步';
  $('connection').classList.toggle('offline', invalid);
}
async function loadHistory() {
  try {
    const response = await fetch('/api/history'); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    commits = data.commits;
    $('latest-commit').textContent = commits[0] ? `${commits[0].id.slice(0, 7)} · 本地提交` : '暂无提交';
    if ($<HTMLDialogElement>('history-dialog').open) renderHistory();
  } catch (error) { if ($<HTMLDialogElement>('history-dialog').open) $('history-content').textContent = String(error); }
}
function renderHistory() {
  $('history-content').innerHTML = commits.map(c => `<div class="commit">${icon('git-commit-horizontal')}<div>${esc(c.message)}<small>${esc(c.id.slice(0, 8))} · ${esc(time(c.at))}</small></div></div>`).join('') || '<p class="quiet">暂无提交</p>';
  if (snapshot?.plan.changes.length) $('history-content').innerHTML += `<h3 class="history-subheading">结构调整</h3>${snapshot.plan.changes.slice().reverse().map(c => `<div class="record"><div class="record-header"><time>${esc(time(c.at))}</time><span>${esc(c.taskIds.join(', '))}</span></div><p>${esc(c.summary)}</p><p class="quiet">${esc(c.reason)}</p></div>`).join('')}`;
  refreshIcons();
}
document.addEventListener('click', event => {
  const element = (event.target as Element).closest<HTMLElement>('button, a'); if (!element) return;
  if (element.dataset.graph) {
    graphId = element.dataset.graph; selected = null; selectedNote = null; tab = 'task'; render();
  } else if (element.dataset.task) selectTask(element.dataset.task, true);
  else if (element.dataset.jump) selectTask(element.dataset.jump, true);
  else if (element.dataset.tab) { tab = element.dataset.tab as typeof tab; renderDetail(); refreshIcons(); }
  else if (element.dataset.note) { selectedNote = element.dataset.note; renderDetail(); refreshIcons(); }
  else if (element.getAttribute('href')?.startsWith('#note=')) {
    event.preventDefault(); selectedNote = decodeURIComponent(element.getAttribute('href')!.slice(6)); renderDetail(); refreshIcons();
  }
});
showAll.addEventListener('change', render);
showImplicit.addEventListener('change', render);
search.addEventListener('input', () => { renderSidebar(); refreshIcons(); });
$('zoom-in').onclick = () => graphView.zoom(1.25);
$('zoom-out').onclick = () => graphView.zoom(0.8);
$('fit').onclick = () => graphView.fit();
$('clear-selection').onclick = () => { selected = null; selectedNote = null; tab = 'task'; render(); };
$('history-button').onclick = () => { $<HTMLDialogElement>('history-dialog').showModal(); renderHistory(); void loadHistory(); };
$('close-history').onclick = () => $<HTMLDialogElement>('history-dialog').close();
setInterval(() => { if ($<HTMLDialogElement>('history-dialog').open) void loadHistory(); }, 3000);
const events = new EventSource('/api/events');
events.addEventListener('plan', event => { try { receive(JSON.parse(event.data)); } catch (error) { $('error').hidden = false; $('error').textContent = `无法显示更新：${String(error)}`; } });
events.onerror = () => { $('connection').textContent = '连接中断'; $('connection').classList.add('offline'); };
events.onopen = () => { $('connection').textContent = invalid ? '更新无效' : '已连接'; $('connection').classList.toggle('offline', invalid); };
refreshIcons();
