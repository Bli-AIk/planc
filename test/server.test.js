const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { startServer } = require('../src/server');
const { fixture, writePlan } = require('./helpers');

async function serverFixture(t) {
  const f = fixture(t); const running = await startServer(f.root, { port: 0, pollInterval: 30 });
  t.after(() => running.close()); return { ...f, ...running };
}
test('serves only packaged UI, validated plan, referenced Markdown and commit summaries', async t => {
  const { root, url } = await serverFixture(t);
  assert.match(await (await fetch(url)).text(), /planc/);
  const response = await fetch(`${url}api/plan`); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.snapshot.plan.tasks.length, 6);
  assert.equal((await (await fetch(`${url}api/history`)).json()).commits.length, 2);
  assert.match(await (await fetch(`${url}api/note?path=notes/user/view.md`)).text(), /清单视图/);
  fs.writeFileSync(path.join(root, '.plan/notes/private.md'), 'unreferenced secret');
  const denied = ['.git/config', 'src/server.js', 'package.json', '../package.json', 'api/note?path=../secret.md', 'api/note?path=notes/../../secret.md', 'api/note?path=notes/private.md', 'api/note?path=notes%2F.git%2Fconfig.md'];
  for (const resource of denied) assert.equal((await fetch(`${url}${resource}`)).status, 404, resource);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal((await fetch(`${url}api/plan`, { method })).status, 405);
  assert.equal((await fetch(`${url}api/plan`, { headers: { Origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
test('rejects DNS-rebinding host headers and non-loopback binds', async t => {
  const { root, url } = await serverFixture(t);
  const status = await new Promise((resolve, reject) => { const req = http.get(url, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(status, 403); await assert.rejects(startServer(root, { host: '0.0.0.0', port: 0 }), /127.0.0.1/);
});
test('SSE picks up nested notes and atomic saves; invalid updates retain last valid snapshot and recover', async t => {
  const { root, url, plan } = await serverFixture(t);
  const abort = new AbortController(); t.after(() => abort.abort());
  const response = await fetch(`${url}api/events`, { signal: abort.signal }); const reader = response.body.getReader(); let buffer = '';
  async function event() {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end >= 0) { const block = buffer.slice(0, end); buffer = buffer.slice(end + 2); const line = block.split('\n').find(s => s.startsWith('data: ')); if (line) return JSON.parse(line.slice(6)); }
      const next = await reader.read(); if (next.done) throw new Error('SSE ended'); buffer += new TextDecoder().decode(next.value);
    }
  }
  const initial = await event(); assert.equal(initial.ok, true);
  const note = path.join(root, '.plan/notes/user/view.md'); fs.writeFileSync(`${note}.tmp`, 'Updated nested Markdown'); fs.renameSync(`${note}.tmp`, note);
  const changed = await event(); assert.equal(changed.snapshot.notes['notes/user/view.md'], 'Updated nested Markdown');
  const file = path.join(root, '.plan/plan.json'); fs.writeFileSync(file, '{broken');
  const broken = await event(); assert.equal(broken.ok, false); assert.equal(broken.snapshot.revision, changed.snapshot.revision);
  assert.equal((await fetch(`${url}api/plan`)).status, 422);
  plan.tasks[2].title = 'Updated title'; writePlan(root, plan);
  const recovered = await event(); assert.equal(recovered.ok, true); assert.equal(recovered.snapshot.plan.tasks[2].title, 'Updated title');
  await reader.cancel();
});
test('occupied ports reject promptly and server shutdown releases the port', async t => {
  const { root, port, close } = await serverFixture(t);
  await assert.rejects(startServer(root, { port }), { code: 'EADDRINUSE' });
  await close();
  const next = await startServer(root, { port }); await next.close();
});
test('standalone Skill serves its packaged page and CLI selects another occupied port', async t => {
  const { root, port } = await serverFixture(t);
  const child = spawn(process.execPath, [path.join(__dirname, '../skill/planc/scripts/planc.cjs'), 'serve', root, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped; });
  const [output] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
  const url = output.toString().match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  assert.ok(url, output.toString()); assert.notEqual(Number(new URL(url).port), port);
  assert.match(await (await fetch(url)).text(), /任务书/);
  assert.equal((await fetch(`${url}app.js`)).status, 200);
  assert.equal((await (await fetch(`${url}api/plan`)).json()).ok, true);
});
