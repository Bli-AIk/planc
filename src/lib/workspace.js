const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { projectRoot, planRoot, assertLocal, auditTree } = require('./paths');
const { emptyPlan, loadSnapshot } = require('./plan');

function git(dir, args) {
  // Ambient Git redirection, hooks, and filters must not write outside .plan.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_GLOBAL = '/dev/null'; env.GIT_CONFIG_NOSYSTEM = '1';
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', '-c', 'core.attributesFile=/dev/null', '-c', 'core.pager=cat', '-C', dir, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function assertIndependentGit(dir) {
  assertLocal(path.join(dir, '.git'), true);
  auditTree(path.join(dir, '.git'), { git: true });
  const top = git(dir, ['rev-parse', '--show-toplevel']).trim();
  const common = git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
  if (path.resolve(top) !== dir || path.resolve(common) !== path.join(dir, '.git')) throw new Error('.plan must be an independent Git repository');
  if (fs.existsSync(path.join(dir, '.git/objects/info/alternates'))) throw new Error('External Git object stores are not supported in .plan');
}
function checkpoint(root, message = 'Update plan') {
  const dir = planRoot(root); const snapshot = loadSnapshot(root);
  auditTree(dir); assertIndependentGit(dir);
  function checkAttributes(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      if (entry.name === '.gitattributes') throw new Error('Git attributes are not supported in .plan (they can execute external filters)');
      if (entry.isDirectory()) checkAttributes(path.join(folder, entry.name));
    }
  }
  checkAttributes(dir);
  if (fs.existsSync(path.join(dir, '.git/info/attributes'))) throw new Error('Git info/attributes is not supported in .plan');
  git(dir, ['add', '--all', '--', '.']);
  const tracked = new Set(git(dir, ['ls-files', '-z']).split('\0'));
  for (const file of ['plan.json', ...Object.keys(snapshot.notes)]) if (!tracked.has(file)) throw new Error(`${file} is ignored by Git; adjust the ignore rule inside .plan before checkpointing`);
  const changed = !!git(dir, ['status', '--porcelain']).trim();
  if (changed) git(dir, ['-c', 'user.name=planc', '-c', 'user.email=planc@localhost', 'commit', '--quiet', '-m', message]);
  return { changed, commit: git(dir, ['rev-parse', 'HEAD']).trim() };
}
function init(root = process.cwd()) {
  root = projectRoot(root);
  const dir = planRoot(root, true); const ignore = path.join(root, '.gitignore');
  assertLocal(ignore, false, true);
  if (fs.existsSync(dir)) {
    auditTree(dir);
    if (fs.existsSync(path.join(dir, '.git'))) assertIndependentGit(dir);
    if (fs.existsSync(path.join(dir, 'plan.json'))) loadSnapshot(root);
  }
  fs.mkdirSync(dir, { recursive: true });
  const notes = path.join(dir, 'notes');
  if (!assertLocal(notes, true, true)) fs.mkdirSync(notes);
  const file = path.join(dir, 'plan.json');
  if (!assertLocal(file, false, true)) fs.writeFileSync(file, `${JSON.stringify(emptyPlan(path.basename(root)), null, 2)}\n`, { flag: 'wx' });
  const content = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  if (content.split(/\r?\n/).filter(line => line.trim()).at(-1) !== '/.plan/') {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    fs.appendFileSync(ignore, `${content && !content.endsWith('\n') ? newline : ''}/.plan/${newline}`);
  }
  if (!fs.existsSync(path.join(dir, '.git'))) git(dir, ['init', '--quiet', '--template=']);
  return checkpoint(root, 'Initialize plan');
}
function history(root) {
  const dir = planRoot(root); assertIndependentGit(dir);
  try {
    return git(dir, ['log', '-30', '-z', '--format=%H%x00%aI%x00%s']).split('\0').reduce((items, value, i, fields) => {
      if (i % 3 === 0 && value) items.push({ id: value, at: fields[i + 1], message: fields[i + 2] }); return items;
    }, []);
  } catch (error) {
    if (/does not have any commits yet|unknown revision|bad default revision/.test(error.stderr?.toString() || '')) return [];
    throw error;
  }
}
module.exports = { init, checkpoint, history, assertIndependentGit, git };
