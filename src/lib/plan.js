const fs = require('node:fs');
const crypto = require('node:crypto');
const Ajv = require('ajv');
const { planFile, assertLocal, assertNoteName, noteFile } = require('./paths');
const ajv = new Ajv({ allErrors: true });
ajv.addFormat('date-time', value => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)));
const validateSchema = ajv.compile(require('../schema.json'));

function emptyPlan(title = 'My project') {
  return { version: 1, title, updatedAt: new Date().toISOString(), tasks: [], relations: [], graphs: [{ id: 'main', title: 'Main', taskIds: [], notes: [] }], checks: [], changes: [] };
}
function readPlan(root) { const file = planFile(root); assertLocal(file); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function noteNames(plan) { return [...new Set([...plan.tasks, ...plan.graphs].flatMap(item => item.notes))].sort(); }
function validatePlan(plan) {
  if (!validateSchema(plan)) return validateSchema.errors.map(e => `${e.instancePath || '/'} ${e.message}${e.params.additionalProperty ? `: ${e.params.additionalProperty}` : ''}`);
  const errors = [];
  for (const key of ['tasks', 'relations', 'graphs', 'checks', 'changes']) {
    const seen = new Set(); for (const item of plan[key]) { if (seen.has(item.id)) errors.push(`Duplicate ${key} id: ${item.id}`); seen.add(item.id); }
  }
  const tasks = new Map(plan.tasks.map(t => [t.id, t]));
  const checks = new Map(plan.checks.map(c => [c.id, c]));
  const degrees = new Map(plan.tasks.map(t => [t.id, 0]));
  const outgoing = new Map(plan.tasks.map(t => [t.id, []]));
  const relations = new Set();
  for (const rel of plan.relations) {
    for (const id of [rel.from, rel.to]) if (!tasks.has(id)) errors.push(`Relation ${rel.id} references unknown task: ${id}`);
    if (rel.type === 'related' && rel.implicit) errors.push(`Related relation ${rel.id} cannot be implicit`);
    const key = JSON.stringify([rel.type, rel.from, rel.to]);
    if (relations.has(key)) errors.push(`Duplicate relation: ${rel.from} -> ${rel.to}`); relations.add(key);
    if (rel.type === 'prerequisite' && tasks.has(rel.from) && tasks.has(rel.to)) {
      degrees.set(rel.to, degrees.get(rel.to) + 1); outgoing.get(rel.from).push(rel.to);
    }
  }
  const queue = [...degrees].filter(([, d]) => d === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) for (const id of outgoing.get(queue[i])) {
    degrees.set(id, degrees.get(id) - 1); if (degrees.get(id) === 0) queue.push(id);
  }
  if (queue.length !== tasks.size) errors.push('Prerequisite graph contains a cycle');
  for (const graph of plan.graphs) for (const id of graph.taskIds) if (!tasks.has(id)) errors.push(`Graph ${graph.id} references unknown task: ${id}`);
  for (const task of plan.tasks) {
    if (task.status === 'completed') {
      const check = checks.get(task.completion?.checkId);
      if (!check || check.taskId !== task.id || check.outcome !== 'completed') errors.push(`Completed task ${task.id} requires its own completed check`);
    } else if (task.completion) errors.push(`Uncompleted task ${task.id} cannot reference a completion check`);
    if (!plan.graphs.some(g => g.taskIds.includes(task.id))) errors.push(`Task ${task.id} must appear in a graph`);
  }
  for (const check of plan.checks) if (!tasks.has(check.taskId)) errors.push(`Check ${check.id} references unknown task: ${check.taskId}`);
  // Structural history can refer to removed task IDs.
  for (const name of noteNames(plan)) try { assertNoteName(name); } catch (error) { errors.push(error.message); }
  return errors;
}
function readiness(plan, taskId) {
  const tasks = new Map(plan.tasks.map(t => [t.id, t]));
  const missing = plan.relations.filter(r => r.type === 'prerequisite' && r.to === taskId && tasks.get(r.from)?.status !== 'completed').map(r => r.from);
  return { ready: tasks.has(taskId) && missing.length === 0, missing };
}
function enrichPlan(plan) { return { ...plan, tasks: plan.tasks.map(t => ({ ...t, readiness: readiness(plan, t.id) })) }; }
function visibleTasks(plan, graph, { showAll = false } = {}) {
  const ids = new Set(graph.taskIds);
  return plan.tasks.filter(t => ids.has(t.id) && (showAll || t.status !== 'not_started' || readiness(plan, t.id).ready));
}
function loadSnapshot(root) {
  const plan = readPlan(root); const errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join('\n'));
  const notes = {};
  for (const name of noteNames(plan)) notes[name] = fs.readFileSync(noteFile(root, name), 'utf8');
  const revision = crypto.createHash('sha256').update(JSON.stringify({ plan, notes })).digest('hex');
  return { revision, plan: enrichPlan(plan), notes };
}
module.exports = { emptyPlan, readPlan, validatePlan, readiness, enrichPlan, visibleTasks, loadSnapshot, noteNames };
