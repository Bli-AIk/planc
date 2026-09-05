#!/usr/bin/env node
const path = require('node:path');
const { parseArgs } = require('node:util');
const { init, checkpoint } = require('./lib/workspace');
const { loadSnapshot } = require('./lib/plan');
const { startServer } = require('./server');

async function main(args = process.argv.slice(2)) {
  try {
    const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
      port: { type: 'string' }, message: { type: 'string', short: 'm' }, help: { type: 'boolean', short: 'h' }
    } });
    const [command, directory] = positionals;
    if (values.help || !command) {
      console.log('planc 0.1.0\n\n  planc init [project-dir]\n  planc validate [project-dir]\n  planc serve [project-dir] [--port 4317]\n  planc checkpoint [project-dir] [-m "Update plan"]\n\nNode >=22 and Git are required. serve is read-only and binds to 127.0.0.1.'); return 0;
    }
    if (positionals.length > 2) throw new Error('Too many arguments; use -m for a checkpoint message');
    if (values.port && command !== 'serve') throw new Error('--port is only valid for serve');
    if (values.message && command !== 'checkpoint') throw new Error('--message is only valid for checkpoint');
    const root = path.resolve(directory || process.cwd());
    if (command === 'init') { const result = init(root); console.log(`Initialized ${path.join(root, '.plan')} (${result.commit.slice(0, 8)})`); return 0; }
    if (command === 'validate') { const { plan } = loadSnapshot(root); console.log(`Valid: ${plan.tasks.length} tasks, ${plan.graphs.length} graphs, ${plan.checks.length} checks`); return 0; }
    if (command === 'checkpoint') { const result = checkpoint(root, values.message); console.log(result.changed ? `Committed ${result.commit.slice(0, 8)}` : 'No changes to commit.'); return 0; }
    if (command === 'serve') {
      let port = values.port === undefined ? 4317 : Number(values.port); let result;
      for (let attempts = 0; ; attempts++) {
        try { result = await startServer(root, { port }); break; }
        catch (error) { if (error.code !== 'EADDRINUSE' || attempts >= 20 || port === 65535) throw error; port++; }
      }
      console.log(`planc serving ${result.url}`);
      const stop = () => result.close().then(() => { process.exitCode = 0; });
      process.once('SIGINT', stop); process.once('SIGTERM', stop); return 0;
    }
    throw new Error(`Unknown command: ${command}`);
  } catch (error) { console.error(`Error: ${error.message}`); return 1; }
}
if (require.main === module) main().then(code => { process.exitCode = code; });
module.exports = { main };
