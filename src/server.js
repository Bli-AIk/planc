const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadSnapshot } = require('./lib/plan');
const { planRoot, projectRoot } = require('./lib/paths');
const { history } = require('./lib/workspace');

async function startServer(root = process.cwd(), options = {}) {
  root = projectRoot(root); planRoot(root);
  const port = options.port ?? 4317;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer between 0 and 65535');
  if (options.host && options.host !== '127.0.0.1') throw new Error('Only 127.0.0.1 is supported');
  const clients = new Set(); const host = '127.0.0.1';
  let lastGood = null; let payload; let serialized; let origin;
  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']]
  ].map(([url, [file, type]]) => [url, { body: fs.readFileSync(path.join(__dirname, '../dist', file)), type }]));
  function refresh() {
    try { lastGood = loadSnapshot(root); payload = { ok: true, snapshot: lastGood }; }
    catch (error) { payload = { ok: false, errors: [error.message], snapshot: lastGood }; }
    const next = JSON.stringify(payload);
    if (next !== serialized) { serialized = next; for (const res of clients) res.write(`event: plan\ndata: ${serialized}\n\n`); }
  }
  refresh();
  const server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const send = (status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Local same-origin requests only' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: 'Read-only service' }); }
    let url;
    try { url = new URL(req.url, origin); } catch { return send(400, { error: 'Invalid URL' }); }
    if (url.pathname === '/api/plan') { refresh(); return send(payload.ok ? 200 : 422, payload); }
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: plan\ndata: ${serialized}\n\n`); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    if (url.pathname === '/api/note') {
      refresh(); const name = url.searchParams.get('path');
      if (!payload.ok || !Object.hasOwn(lastGood.notes, name)) return send(404, { error: 'No readable, referenced note at this path' });
      return send(200, lastGood.notes[name], 'text/markdown; charset=utf-8');
    }
    if (url.pathname === '/api/history') {
      try { return send(200, { commits: history(root) }); } catch (error) { return send(422, { error: error.message }); }
    }
    const asset = assets.get(url.pathname);
    if (asset) { res.writeHead(200, { 'Content-Type': asset.type }); return res.end(asset.body); }
    send(404, { error: 'Not found' });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
  origin = `http://${host}:${server.address().port}`;
  // Poll complete snapshots so atomic file replacements and nested note edits behave identically across platforms.
  const poll = setInterval(refresh, options.pollInterval ?? 500);
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': heartbeat\n\n'); }, 15000);
  let closing;
  const close = () => closing ??= new Promise((resolve, reject) => {
    clearInterval(poll); clearInterval(heartbeat);
    for (const res of clients) res.end(); clients.clear();
    server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections();
  });
  server.once('close', () => { clearInterval(poll); clearInterval(heartbeat); });
  return { server, close, host, port: server.address().port, url: `${origin}/` };
}
module.exports = { startServer };
