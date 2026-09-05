const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validatePlan, readiness, visibleTasks, loadSnapshot, emptyPlan } = require('../src/lib/plan');
const { fixture, smallPlan, complete } = require('./helpers');

test('linear progression, all prerequisites, associations and implicit edges', () => {
  const plan = smallPlan(); const visible = () => visibleTasks(plan, plan.graphs[0]).map(t => t.id);
  assert.deepEqual(validatePlan(plan), []); assert.deepEqual(visible(), ['a', 'd']);
  assert.equal(readiness(plan, 'd').ready, true);
  complete(plan, 'a'); assert.deepEqual(visible(), ['a', 'b', 'd']); assert.equal(readiness(plan, 'c').ready, false);
  complete(plan, 'b', 'user_confirmation'); assert.equal(readiness(plan, 'c').ready, true); assert.deepEqual(visible(), ['a', 'b', 'c', 'd']);
  assert.deepEqual(validatePlan(plan), []);
  plan.relations.find(r => r.id === 'bc').implicit = false; assert.equal(readiness(plan, 'c').ready, true);
});
test('in-progress/completed remain visible; implicit toggle cannot reveal blocked tasks', () => {
  const plan = smallPlan(); plan.tasks[2].status = 'in_progress';
  assert.deepEqual(visibleTasks(plan, plan.graphs[0], { showHiddenPrerequisites: true }).map(t => t.id), ['a', 'c', 'd']);
  assert.equal(visibleTasks(plan, plan.graphs[0], { showAll: true }).length, 4);
  complete(plan, 'c'); assert.equal(plan.tasks[2].status, 'completed'); assert.equal(readiness(plan, 'c').ready, false);
  assert.deepEqual(validatePlan(plan), []);
});
test('shared tasks and cross-graph prerequisites use global state', () => {
  const plan = smallPlan(); plan.graphs.push({ id: 'second', title: 'Second', taskIds: ['b', 'c'], notes: [] });
  assert.equal(visibleTasks(plan, plan.graphs[1]).length, 0); complete(plan, 'a');
  assert.deepEqual(visibleTasks(plan, plan.graphs[1]).map(t => t.id), ['b']);
});
test('invalid data, references, cycles, missing evidence and completion are rejected', () => {
  const cases = [
    p => { p.version = 2; }, p => { p.tasks[0].goal = ''; }, p => { p.tasks[0].completionCriteria = []; },
    p => { p.tasks[0].status = 'ready'; }, p => { p.tasks.push({ ...p.tasks[0] }); }, p => { p.relations[0].from = 'unknown'; },
    p => { p.relations.push({ id: 'cycle', from: 'c', to: 'a', type: 'prerequisite' }); }, p => { p.graphs[0].taskIds.push('unknown'); },
    p => { p.tasks[0].status = 'completed'; }, p => { p.tasks[0].notes = ['notes/../../secret.md']; },
    p => { p.tasks[0].notes = ['notes/.git/config.md']; }, p => { p.tasks[0].notes = ['notes/folder\\secret.md']; },
    p => { p.tasks[0].notes = ['/tmp/secret.md']; }, p => { p.relations[3].implicit = true; },
    p => { complete(p, 'a', 'user_confirmation'); delete p.checks[0].dissent; }, p => { complete(p, 'a'); p.checks[0].evidence = []; },
    p => { complete(p, 'a'); p.tasks[1].status = 'completed'; p.tasks[1].completion = p.tasks[0].completion; },
    p => { p.updatedAt = 'invalid'; }, p => { p.tasks[0].color = 'red'; }
  ];
  for (const mutate of cases) { const plan = smallPlan(); mutate(plan); assert.ok(validatePlan(plan).length, mutate.toString()); }
  assert.ok(validatePlan(null).length); assert.ok(validatePlan({ tasks: [null] }).length); assert.deepEqual(validatePlan(emptyPlan()), []);
});
test('snapshot changes on Markdown edits, rejects missing notes and corrupt JSON', t => {
  const { root } = fixture(t); const before = loadSnapshot(root);
  fs.appendFileSync(path.join(root, '.plan/notes/user/view.md'), '\nA new user conclusion.\n');
  const after = loadSnapshot(root); assert.notEqual(before.revision, after.revision); assert.match(after.notes['notes/user/view.md'], /new user conclusion/);
  fs.rmSync(path.join(root, '.plan/notes/user/view.md')); assert.throws(() => loadSnapshot(root), /Missing/);
  fs.writeFileSync(path.join(root, '.plan/plan.json'), '{broken'); assert.throws(() => loadSnapshot(root), /JSON|property name/);
});
test('symbolic and hard-linked notes cannot disclose outside files', t => {
  const { root } = fixture(t); const note = path.join(root, '.plan/notes/user/view.md'); const secret = path.join(root, 'secret.md');
  fs.writeFileSync(secret, 'private'); fs.rmSync(note); fs.symlinkSync(secret, note); assert.throws(() => loadSnapshot(root), /Unsafe path/);
  fs.rmSync(note); fs.linkSync(secret, note); assert.throws(() => loadSnapshot(root), /Unsafe path/);
});
