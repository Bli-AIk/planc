import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import MarkdownIt from 'markdown-it';

// Execute the published installation instructions as written, in disposable projects.
for (const readme of ['README.md', 'readme_zh-hans.md']) {
  const blocks = new MarkdownIt().parse(fs.readFileSync(readme, 'utf8'), {}).filter(token => token.type === 'fence' && token.info.trim() === 'sh');
  const prepare = blocks.find(block => block.content.includes('mkdir -p planc-test'))?.content;
  assert.ok(prepare, `${readme}: missing test-project preparation`);
  const installs = blocks.filter(block => block.content.includes('git clone --depth 1'));
  assert.equal(installs.length, 2, `${readme}: expected two installation examples`);
  for (const block of installs) {
    const agent = block.content.includes('install.mjs" codex .') ? 'codex' : 'claude';
    const folder = agent === 'codex' ? '.agents' : '.claude';
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'planc-readme-'));
    let child;
    try {
      execFileSync('sh', ['-c', `${prepare}\n${block.content}`], { cwd: temp, stdio: 'pipe', timeout: 120000 });
      const root = path.join(temp, 'planc-test');
      const cli = path.join(root, folder, 'skills/planc/scripts/planc.cjs');
      assert.ok(fs.existsSync(path.join(root, folder, 'skills/planc/SKILL.md')));
      assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
      assert.deepEqual(fs.readFileSync(cli), fs.readFileSync('skill/planc/scripts/planc.cjs'));
      child = spawn(process.execPath, [cli, 'serve', '.'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      const [output] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
      const url = output.toString().match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0]; assert.ok(url);
      const response = await fetch(`${url}api/plan`, { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
      const style = await (await fetch(`${url}style.css`)).text(); assert.match(style, /--base: #1e1e2e/);
      console.log(`PASS ${readme}: ${agent} install, init, validate, packaged page and local server`);
    } finally {
      if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; }
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
}
