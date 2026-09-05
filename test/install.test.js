const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { temporary } = require('./helpers');
const installer = path.join(__dirname, '../scripts/install.mjs');

for (const [agent, folder] of [['codex', '.agents'], ['claude', '.claude']]) {
  test(`${agent}: project-local install, init, validate and serve work without npm dependencies`, async t => {
    const parent = temporary(t); const root = path.join(parent, 'project with spaces'); fs.mkdirSync(root);
    const install = spawnSync(process.execPath, [installer, agent, root], { encoding: 'utf8' });
    assert.equal(install.status, 0, install.stderr);
    const skill = path.join(root, folder, 'skills/planc');
    assert.ok(fs.existsSync(path.join(skill, 'SKILL.md')));
    assert.deepEqual(fs.readdirSync(root), [folder]);
    const cli = path.join(skill, 'scripts/planc.cjs');
    for (const command of ['init', 'validate', 'checkpoint']) {
      const result = spawnSync(process.execPath, [cli, command, '.'], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const child = spawn(process.execPath, [cli, 'serve', '.', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => { if (child.exitCode !== null) return; const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; });
    const [output] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    const url = output.toString().match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]; assert.ok(url);
    assert.equal((await (await fetch(`${url}api/plan`)).json()).ok, true);
    assert.equal((await fetch(`${url}app.js`)).status, 200);
    assert.deepEqual(fs.readdirSync(root).sort(), [folder, '.gitignore', '.plan'].sort());
    const before = fs.readFileSync(path.join(skill, 'SKILL.md'));
    const repeat = spawnSync(process.execPath, [installer, agent, root], { encoding: 'utf8' });
    assert.equal(repeat.status, 1); assert.match(repeat.stderr, /Already installed/); assert.deepEqual(fs.readFileSync(path.join(skill, 'SKILL.md')), before);
  });
}
test('installer refuses home, unknown/global agents and redirected skill directories', t => {
  const root = temporary(t); const outside = temporary(t);
  for (const args of [['codex', os.homedir()], ['--global', root], ['unknown', root]]) {
    const result = spawnSync(process.execPath, [installer, ...args], { encoding: 'utf8' }); assert.equal(result.status, 1);
  }
  fs.symlinkSync(outside, path.join(root, '.agents'));
  const redirected = spawnSync(process.execPath, [installer, 'codex', root], { encoding: 'utf8' });
  assert.equal(redirected.status, 1); assert.match(redirected.stderr, /local directory/); assert.deepEqual(fs.readdirSync(outside), []);
});
