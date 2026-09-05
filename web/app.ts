import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import rust from 'highlight.js/lib/languages/rust';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import toml from 'highlight.js/lib/languages/ini';
import markdown from 'highlight.js/lib/languages/markdown';
import { createIcons, Workflow, Eye, History, Search, GitCommitHorizontal, ListTodo, Plus, Minus, Scan, CircleCheck, CircleDot, Circle, LockKeyhole, X, Network, FileText, ArrowUpRight, ArrowRight, MessageSquare, GitBranch } from 'lucide';
import { TaskGraph, isVisible } from './graph';
import type { Task, Graph, Check, Payload, Snapshot, Commit } from './types';
import { locale, t, toggleLocale } from './i18n';

const icons = { Workflow, Eye, History, Search, GitCommitHorizontal, ListTodo, Plus, Minus, Scan, CircleCheck, CircleDot, Circle, LockKeyhole, X, Network, FileText, ArrowUpRight, ArrowRight, MessageSquare, GitBranch };
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const refreshIcons = () => createIcons({ icons });
hljs.registerLanguage('rust', rust); hljs.registerLanguage('json', json); hljs.registerLanguage('bash', bash); hljs.registerLanguage('shell', bash); hljs.registerLanguage('sh', bash); hljs.registerLanguage('toml', toml); hljs.registerLanguage('markdown', markdown); hljs.registerLanguage('md', markdown);
const time = (value: string) => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
let snapshot: Snapshot | null = null;
let graphId: string | null = null;
let selected: string | null = null;
let tab: 'task' | 'user-notes' | 'agent-notes' | 'checks' = 'task';
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
function kindName(kind: Task['kind']) { return { implementation: locale === 'zh' ? '实现' : 'Implementation', understanding: locale === 'zh' ? '理解' : 'Understanding', investigation: locale === 'zh' ? '调查' : 'Investigation', decision: locale === 'zh' ? '决策' : 'Decision' }[kind]; }
function statusName(task: Task) { return { completed: t('completed'), in_progress: t('inProgress'), ready: t('ready'), blocked: t('blocked') }[stateOf(task)]; }
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
  $('task-list').innerHTML = tasks.length ? tasks.map(taskButton).join('') : `<p class="quiet">${t('noMatchingTasks')}</p>`;
}
function renderGraph() {
  if (!snapshot) return;
  const graph = currentGraph(); const visible = displayedTasks();
  $('graph-title').textContent = graph?.title ?? t('noTasks');
  $('visible-count').textContent = `${visible.length} / ${graph?.taskIds.length ?? 0}`;
  $('graph-empty').hidden = visible.length > 0;
  $('graph-empty').querySelector('p')!.textContent = graph?.taskIds.length ? t('noVisibleTasks') : t('noTasks');
  $('updated-at').textContent = time(snapshot.plan.updatedAt);
  graphView.update(snapshot.plan, graph, selected, showAll.checked, showImplicit.checked);
}
function dependency(id: string, implicit = false) {
  const task = snapshot!.plan.tasks.find(t => t.id === id)!;
  const home = snapshot!.plan.graphs.find(g => g.taskIds.includes(id));
  const crossGraph = !currentGraph()?.taskIds.includes(id);
  return `<button class="dependency" data-jump="${esc(id)}"><span class="${stateOf(task)}">${icon(statusIcon(task))}</span><span class="dep-body">${esc(task.title)}<small>${esc(task.id)}${implicit ? ` · ${locale === 'zh' ? '隐式前置' : 'implicit prerequisite'}` : ''}${crossGraph ? ` · ${esc(home?.title)}` : ''}</small></span>${icon(crossGraph ? 'arrow-up-right' : 'arrow-right')}</button>`;
}
function renderCheck(check: Check) {
  return `<div class="record"><div class="record-header"><span>${check.kind === 'user_confirmation' ? t('userConfirmed') : check.outcome === 'completed' ? t('checked') : t('needsReview')}</span><time>${esc(time(check.at))}</time></div><p>${esc(check.summary)}</p><ul>${check.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>${check.dissent ? `<div class="dissent"><strong>${t('dissent')}</strong><p>${esc(check.dissent)}</p></div>` : ''}</div>`;
}
function renderTask(task: Task) {
  const prereqs = snapshot!.plan.relations.filter(r => r.type === 'prerequisite' && r.to === task.id);
  const related = snapshot!.plan.relations.filter(r => r.type === 'related' && (r.from === task.id || r.to === task.id));
  const completion = snapshot!.plan.checks.find(c => c.id === task.completion?.checkId);
  const latest = snapshot!.plan.checks.filter(c => c.taskId === task.id).at(-1);
  return `<section class="detail-section"><h3>${t('goal')}</h3><p>${esc(task.goal)}</p></section>
    <section class="detail-section"><h3>${t('criteria')}</h3><ol class="criteria">${task.completionCriteria.map(c => `<li>${esc(c)}</li>`).join('')}</ol></section>
    <section class="detail-section"><h3>${t('prerequisites')} · ${prereqs.length}</h3>${prereqs.length ? prereqs.map(r => dependency(r.from, r.implicit)).join('') : `<p class="quiet">${t('noPrerequisites')}</p>`}</section>
    ${related.length ? `<section class="detail-section"><h3>${t('related')}</h3>${related.map(r => dependency(r.from === task.id ? r.to : r.from)).join('')}</section>` : ''}
    ${completion ? `<section class="detail-section"><h3>${t('completionRecord')}</h3>${renderCheck(completion)}</section>` : ''}
    ${latest && latest.outcome === 'needs_work' && latest.id !== completion?.id ? `<section class="detail-section"><h3>${t('currentConcern')}</h3>${renderCheck(latest)}</section>` : ''}`;
}
function renderMarkdown(name: string) {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: false, highlight(code, language) {
    const normalized = language.trim().toLowerCase();
    if (!normalized || !hljs.getLanguage(normalized)) return '';
    try { return hljs.highlight(code, { language: normalized }).value; }
    catch { return ''; }
  } });
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
function isAgentNote(name: string) { return /^notes\/agent\//.test(name); }
function userNotes(names: string[]) { return names.filter(name => !isAgentNote(name)); }
function agentNotes(names: string[]) { return names.filter(isAgentNote); }
function renderNotes(names: string[]) {
  if (!names.length) return `<p class="quiet">${t('noNotes')}</p>`;
  if (!selectedNote || !Object.hasOwn(snapshot!.notes, selectedNote)) selectedNote = names[0];
  return `<nav class="note-switch" aria-label="${t('note')}">${[...new Set([...names, selectedNote])].map(name => `<button data-note="${esc(name)}" aria-current="${name === selectedNote}">${icon('file-text')}${esc(name.replace(/^notes\//, ''))}</button>`).join('')}</nav><div class="markdown">${renderMarkdown(selectedNote)}</div>`;
}
function renderDetail() {
  if (!snapshot) return;
  const content = $('detail-content'); const scroll = content.scrollTop;
  const task = snapshot.plan.tasks.find(t => t.id === selected); const graph = currentGraph();
  $('clear-selection').hidden = !task;
  $('detail-label').textContent = task ? `${kindName(task.kind)} · ${task.id}` : t('overview');
  $('detail-title').innerHTML = task ? `<h2>${esc(task.title)}</h2><div class="task-meta">${badge(task)}<span>${kindName(task.kind)}</span>${task.status === 'not_started' ? `<span>${t('notStarted')}</span>` : ''}</div>` : `<h2>${esc(graph?.title ?? snapshot.plan.title)}</h2><div class="task-meta"><span>${graph?.taskIds.length ?? 0} ${t('tasks')}</span><span>${graph?.notes.length ?? 0} ${t('discussion')}</span></div>`;
  const names = task?.notes ?? graph?.notes ?? [];
  const mine = userNotes(names); const agent = agentNotes(names);
  const tabs = task ? [['task', t('task')], ['user-notes', `${t('userNotes')} ${mine.length}`], ['agent-notes', `${t('agentNotes')} ${agent.length}`], ['checks', `${t('checks')} ${snapshot.plan.checks.filter(c => c.taskId === task.id).length}`]] : [['task', t('overviewTab')], ['agent-notes', `${t('discussion')} ${agent.length}`], ['user-notes', `${t('userNotes')} ${mine.length}`]];
  if (!task && tab === 'checks') tab = 'task';
  $('detail-tabs').innerHTML = tabs.map(([id, title]) => `<button role="tab" data-tab="${id}" aria-selected="${tab === id}">${title}</button>`).join('');
  if (tab === 'user-notes') content.innerHTML = renderNotes(mine);
  else if (tab === 'agent-notes') content.innerHTML = renderNotes(agent);
  else if (tab === 'checks' && task) content.innerHTML = snapshot.plan.checks.filter(c => c.taskId === task.id).slice().reverse().map(renderCheck).join('') || `<p class="quiet">${t('noChecks')}</p>`;
  else if (task) content.innerHTML = renderTask(task);
  else content.innerHTML = `<section class="detail-section"><h3>${t('currentTasks')}</h3>${displayedTasks().map(taskButton).join('') || `<p class="quiet">${t('noVisibleTasks')}</p>`}</section>`;
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
  $('error').textContent = payload.ok ? '' : `${snapshot ? t('updateInvalid') : t('planUnreadable')}\n${(payload.errors ?? []).join('\n')}`;
  $('connection').textContent = invalid ? t('invalid') : t('synced');
  $('connection').classList.toggle('offline', invalid);
}
async function loadHistory() {
  try {
    const response = await fetch('/api/history'); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    commits = data.commits;
    $('latest-commit').textContent = commits[0] ? `${commits[0].id.slice(0, 7)} · ${t('localCommit')}` : t('noCommits');
    if ($<HTMLDialogElement>('history-dialog').open) renderHistory();
  } catch (error) { if ($<HTMLDialogElement>('history-dialog').open) $('history-content').textContent = String(error); }
}
function renderHistory() {
  $('history-content').innerHTML = commits.map(c => `<div class="commit">${icon('git-commit-horizontal')}<div>${esc(c.message)}<small>${esc(c.id.slice(0, 8))} · ${esc(time(c.at))}</small></div></div>`).join('') || `<p class="quiet">${t('noCommits')}</p>`;
  if (snapshot?.plan.changes.length) $('history-content').innerHTML += `<h3 class="history-subheading">${t('changes')}</h3>${snapshot.plan.changes.slice().reverse().map(c => `<div class="record"><div class="record-header"><time>${esc(time(c.at))}</time><span>${esc(c.taskIds.join(', '))}</span></div><p>${esc(c.summary)}</p><p class="quiet">${esc(c.reason)}</p></div>`).join('')}`;
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
const layout = document.querySelector<HTMLElement>('.app-layout')!;
const inspectorResizer = $('inspector-resizer');
const storedWidth = Number(localStorage.getItem('planc.inspectorWidth'));
if (Number.isFinite(storedWidth) && storedWidth >= 280 && storedWidth <= 620) layout.style.setProperty('--inspector-width', `${storedWidth}px`);
function setInspectorWidth(width: number, save = false) {
  const bounded = Math.max(280, Math.min(620, width)); layout.style.setProperty('--inspector-width', `${bounded}px`);
  if (save) localStorage.setItem('planc.inspectorWidth', String(Math.round(bounded)));
}
inspectorResizer.addEventListener('pointerdown', event => {
  event.preventDefault(); inspectorResizer.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => setInspectorWidth(window.innerWidth - moveEvent.clientX);
  const end = () => { setInspectorWidth(parseFloat(getComputedStyle(layout).getPropertyValue('--inspector-width')), true); inspectorResizer.removeEventListener('pointermove', move); inspectorResizer.removeEventListener('pointerup', end); };
  inspectorResizer.addEventListener('pointermove', move); inspectorResizer.addEventListener('pointerup', end, { once: true });
});
inspectorResizer.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const current = parseFloat(getComputedStyle(layout).getPropertyValue('--inspector-width')); setInspectorWidth(current + (event.key === 'ArrowLeft' ? 16 : -16), true); } });
const events = new EventSource('/api/events');
events.addEventListener('plan', event => { try { receive(JSON.parse(event.data)); } catch (error) { $('error').hidden = false; $('error').textContent = `${t('cannotDisplay')}${String(error)}`; } });
events.onerror = () => { $('connection').textContent = t('disconnected'); $('connection').classList.add('offline'); };
events.onopen = () => { $('connection').textContent = invalid ? t('invalid') : t('connected'); $('connection').classList.toggle('offline', invalid); };
function applyLocale() {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  $('readonly-label').textContent = t('readonly');
  $('connection').textContent = t('connecting');
  $('graphs-label').textContent = t('topicGraphs');
  $('tasks-label').textContent = t('tasks');
  $<HTMLInputElement>('search').placeholder = t('searchTasks'); $('search').setAttribute('aria-label', t('searchTasks'));
  $('graphs').setAttribute('aria-label', t('topicGraphs')); $('task-list').setAttribute('aria-label', t('taskList'));
  document.querySelector<HTMLElement>('.graph-workspace')!.setAttribute('aria-label', t('planGraph'));
  $('graph-eyebrow').textContent = t('taskbook'); $('show-all-label').textContent = t('hiddenItems'); $('show-implicit-label').textContent = t('hiddenPrereqs');
  $('graph').setAttribute('aria-label', t('dependencyGraph')); $('graph-empty').querySelector('p')!.textContent = t('noTasks');
  $('zoom-in').setAttribute('aria-label', t('zoomIn')); $('zoom-in').setAttribute('title', t('zoomIn')); $('zoom-out').setAttribute('aria-label', t('zoomOut')); $('zoom-out').setAttribute('title', t('zoomOut')); $('fit').setAttribute('aria-label', t('fit')); $('fit').setAttribute('title', t('fit'));
  $('completed-label').textContent = t('completed'); $('progress-label').textContent = t('inProgress'); $('ready-label').textContent = t('ready'); $('blocked-label').textContent = t('blocked');
  $('inspector').setAttribute('aria-label', t('taskDetails')); $('inspector-resizer').setAttribute('aria-label', t('resizeInspector')); $('inspector-resizer').setAttribute('title', t('dragResizeInspector')); $('clear-selection').setAttribute('aria-label', t('closeDetails')); $('clear-selection').setAttribute('title', t('closeDetails')); $('detail-tabs').setAttribute('aria-label', t('detailView'));
  $('history-button').setAttribute('aria-label', t('localHistory')); $('history-button').setAttribute('title', t('localHistory')); $('history-title').textContent = t('localHistory'); $('close-history').setAttribute('aria-label', t('closeHistory')); $('close-history').setAttribute('title', t('closeHistory'));
  $('language-button').textContent = t('language'); $('language-button').setAttribute('aria-label', t('languageTitle')); $('language-button').setAttribute('title', t('languageTitle'));
}
$('language-button').onclick = () => { toggleLocale(); location.reload(); };
applyLocale();
refreshIcons();
