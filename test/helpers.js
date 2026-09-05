const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { init, checkpoint } = require('../src/lib/workspace');
const { emptyPlan } = require('../src/lib/plan');

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planc-test-'));
  t?.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function writePlan(root, plan) { fs.writeFileSync(path.join(root, '.plan/plan.json'), `${JSON.stringify(plan, null, 2)}\n`); }
function fixture(t) {
  const root = temporary(t); init(root);
  const plan = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/plan.json'), 'utf8'));
  fs.cpSync(path.join(__dirname, '../examples/notes'), path.join(root, '.plan/notes'), { recursive: true });
  writePlan(root, plan); checkpoint(root, 'Load example plan'); return { root, plan };
}
function task(id, status = 'not_started') { return { id, title: id, kind: 'implementation', goal: `Complete ${id}`, completionCriteria: [`Observe ${id}`], status, notes: [] }; }
function smallPlan() {
  const plan = emptyPlan('Test'); plan.tasks = ['a', 'b', 'c', 'd'].map(id => task(id)); plan.graphs[0].taskIds = plan.tasks.map(t => t.id);
  plan.relations = [{ id: 'ab', from: 'a', to: 'b', type: 'prerequisite' }, { id: 'bc', from: 'b', to: 'c', type: 'prerequisite', implicit: true }, { id: 'ac', from: 'a', to: 'c', type: 'prerequisite' }, { id: 'cd', from: 'c', to: 'd', type: 'related' }]; return plan;
}
function complete(plan, id, kind = 'review') {
  const check = { id: `check-${id}-${plan.checks.length}`, taskId: id, at: new Date().toISOString(), kind, outcome: 'completed', summary: 'User reported completion and requested checking', evidence: ['Inspected user-provided results'], ...(kind === 'user_confirmation' ? { dissent: 'The user understands the outstanding concern and explicitly confirms completion' } : {}) };
  plan.checks.push(check); Object.assign(plan.tasks.find(t => t.id === id), { status: 'completed', completion: { checkId: check.id } });
}
module.exports = { temporary, writePlan, fixture, task, smallPlan, complete };
