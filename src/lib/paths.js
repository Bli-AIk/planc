const fs = require('node:fs');
const path = require('node:path');

function projectRoot(root = process.cwd()) { return fs.realpathSync(path.resolve(root)); }
function stat(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function assertLocal(file, directory = false, optional = false) {
  const info = stat(file);
  if (!info && optional) return false;
  if (!info) throw new Error(`Missing ${file}`);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || (!directory && info.nlink > 1)) {
    throw new Error(`Unsafe path (expected a local ${directory ? 'directory' : 'file'}): ${file}`);
  }
  return true;
}
function planRoot(root = process.cwd(), optional = false) {
  const dir = path.join(projectRoot(root), '.plan');
  assertLocal(dir, true, optional);
  return dir;
}
function planFile(root) { return path.join(planRoot(root), 'plan.json'); }
function assertNoteName(name) {
  if (typeof name !== 'string' || !name.startsWith('notes/') || !name.endsWith('.md') || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name) || name.split('/').some(p => !p || p.startsWith('.'))) throw new Error(`Unsafe note path: ${name}`);
}
function noteFile(root, name) {
  assertNoteName(name);
  let file = planRoot(root);
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) { file = path.join(file, parts[i]); assertLocal(file, i < parts.length - 1); }
  return file;
}
function auditTree(dir, { git = false, top = true } = {}) {
  assertLocal(dir, true);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' && !git) {
      if (!top) throw new Error(`Nested Git repository is not supported: ${dir}`);
      continue;
    }
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) auditTree(file, { git, top: false }); else assertLocal(file);
  }
}
module.exports = { projectRoot, planRoot, planFile, assertLocal, assertNoteName, noteFile, auditTree };
