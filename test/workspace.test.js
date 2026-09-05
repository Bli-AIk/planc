const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { init, checkpoint, history, git } = require('../src/lib/workspace');
const { temporary, fixture, writePlan } = require('./helpers');

test('init is idempotent, preserves existing files/config, and isolates Git from an outer repository', t => {
  const root = temporary(t); execFileSync('git', ['init', '--quiet', root]);
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\r\nkeep-me');
  fs.mkdirSync(path.join(root, '.plan/notes'), { recursive: true }); fs.writeFileSync(path.join(root, '.plan/notes/personal.md'), 'Do not rewrite me.');
  init(root); const first = history(root); const before = fs.readFileSync(path.join(root, '.plan/plan.json'), 'utf8');
  git(path.join(root, '.plan'), ['config', 'planc.keep', 'yes']);
  init(root);
  assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), 'node_modules/\r\nkeep-me\r\n/.plan/\r\n');
  assert.equal(fs.readFileSync(path.join(root, '.plan/plan.json'), 'utf8'), before);
  assert.equal(fs.readFileSync(path.join(root, '.plan/notes/personal.md'), 'utf8'), 'Do not rewrite me.');
  assert.equal(git(path.join(root, '.plan'), ['config', 'planc.keep']).trim(), 'yes');
  assert.deepEqual(history(root), first); assert.equal(first.length, 1);
  assert.equal(git(path.join(root, '.plan'), ['rev-parse', '--show-toplevel']).trim(), path.join(root, '.plan'));
  assert.equal(git(path.join(root, '.plan'), ['remote']).trim(), '');
  assert.equal(fs.existsSync(path.join(root, '.gitmodules')), false);
  assert.equal(execFileSync('git', ['check-ignore', '.plan/plan.json'], { cwd: root, encoding: 'utf8' }).trim(), '.plan/plan.json');
});
test('init repairs a later negation by appending the ignore rule once', t => {
  const root = temporary(t); fs.writeFileSync(path.join(root, '.gitignore'), '/.plan/\n!/.plan/\n');
  init(root); init(root); assert.equal(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), '/.plan/\n!/.plan/\n/.plan/\n');
});
test('checkpoint validates before committing, preserves notes, and adds no empty commit', t => {
  const { root, plan } = fixture(t); const count = history(root).length;
  assert.equal(checkpoint(root).changed, false);
  const note = path.join(root, '.plan/notes/user/view.md'); fs.appendFileSync(note, '\nUser conclusion.\n'); const bytes = fs.readFileSync(note);
  assert.equal(checkpoint(root, 'User notes').changed, true); assert.deepEqual(fs.readFileSync(note), bytes);
  assert.equal(history(root).length, count + 1); assert.equal(history(root)[0].message, 'User notes');
  const outerIgnore = fs.readFileSync(path.join(root, '.gitignore'));
  plan.relations[0].from = 'missing'; writePlan(root, plan);
  assert.throws(() => checkpoint(root), /unknown task/); assert.equal(history(root).length, count + 1);
  assert.deepEqual(fs.readFileSync(path.join(root, '.gitignore')), outerIgnore);
});
test('init does not overwrite corrupt pre-existing plans', t => {
  const root = temporary(t); fs.mkdirSync(path.join(root, '.plan')); fs.writeFileSync(path.join(root, '.plan/plan.json'), 'not json');
  assert.throws(() => init(root)); assert.equal(fs.readFileSync(path.join(root, '.plan/plan.json'), 'utf8'), 'not json');
  assert.equal(fs.existsSync(path.join(root, '.gitignore')), false);
});
test('symlinks and linked worktrees cannot redirect initialization or checkpoints', t => {
  const outside = temporary(t); const root = temporary(t); fs.symlinkSync(outside, path.join(root, '.plan'));
  assert.throws(() => init(root), /Unsafe path/); assert.deepEqual(fs.readdirSync(outside), []);
  fs.rmSync(path.join(root, '.plan')); fs.writeFileSync(path.join(outside, 'ignore'), 'preserve'); fs.symlinkSync(path.join(outside, 'ignore'), path.join(root, '.gitignore'));
  assert.throws(() => init(root), /Unsafe path/); assert.equal(fs.readFileSync(path.join(outside, 'ignore'), 'utf8'), 'preserve');
  fs.rmSync(path.join(root, '.gitignore')); init(root);
  fs.rmSync(path.join(root, '.plan/.git'), { recursive: true }); fs.writeFileSync(path.join(root, '.plan/.git'), `gitdir: ${outside}\n`);
  assert.throws(() => checkpoint(root), /Unsafe path/);
});
test('local Git worktree redirection and hooks cannot write to outer project', t => {
  const root = temporary(t); init(root); const dir = path.join(root, '.plan');
  const marker = path.join(root, 'hook-ran'); fs.mkdirSync(path.join(dir, '.git/hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git/hooks/pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'notes/local.md'), 'local'); checkpoint(root);
  assert.equal(fs.existsSync(marker), false);
  git(dir, ['config', 'core.worktree', root]);
  assert.throws(() => checkpoint(root), /independent Git/);
});
test('checkpoint rejects nested repositories and filter attributes without executing them', t => {
  const root = temporary(t); init(root);
  const dir = path.join(root, '.plan'); const nested = path.join(dir, 'notes/embedded');
  fs.mkdirSync(nested); execFileSync('git', ['init', '--quiet', nested]);
  assert.throws(() => checkpoint(root), /Nested Git/);
  fs.rmSync(nested, { recursive: true });
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.md filter=external\n');
  assert.throws(() => checkpoint(root), /attributes/);
  assert.equal(history(root).length, 1);
});
test('standalone Skill runs without package dependencies or writes outside its target .plan', t => {
  const root = temporary(t); const isolated = temporary(t);
  fs.cpSync(path.join(__dirname, '../skill/planc'), path.join(isolated, 'planc'), { recursive: true });
  const cli = path.join(isolated, 'planc/scripts/planc.cjs');
  for (const command of ['init', 'validate', 'checkpoint']) {
    const result = spawnSync(process.execPath, [cli, command, root], { cwd: isolated, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(fs.readdirSync(root).sort(), ['.gitignore', '.plan']);
  const invalid = spawnSync(process.execPath, [cli, 'checkpoint', root, 'unexpected'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Too many arguments/);
});
