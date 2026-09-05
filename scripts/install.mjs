#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const locations = { codex: '.agents', claude: '.claude' };
const source = fileURLToPath(new URL('../skill/planc/', import.meta.url));

function localDirectory(directory, create = false) {
  let stat;
  try { stat = fs.lstatSync(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!stat && create) { fs.mkdirSync(directory); return; }
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Expected a local directory: ${directory}`);
}

export function install(agent, project = process.cwd()) {
  if (!Object.hasOwn(locations, agent)) throw new Error('Choose codex or claude. Only project-local installation is supported.');
  const root = fs.realpathSync(path.resolve(project));
  localDirectory(root);
  if (root === fs.realpathSync(os.homedir())) throw new Error('Home-directory installation is not supported. Choose a project directory.');
  for (const file of ['SKILL.md', 'scripts/planc.cjs', 'dist/index.html', 'dist/app.js', 'dist/style.css', 'references/schema.json']) {
    if (!fs.statSync(path.join(source, file)).isFile()) throw new Error(`Missing bundled skill file: ${file}. Run npm run build in the planc source repository.`);
  }
  const agentDir = path.join(root, locations[agent]);
  const skillsDir = path.join(agentDir, 'skills');
  const destination = path.join(skillsDir, 'planc');
  localDirectory(agentDir, true); localDirectory(skillsDir, true);
  try { fs.lstatSync(destination); throw new Error(`Already installed: ${destination}. Existing files were preserved.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = fs.mkdtempSync(path.join(skillsDir, '.planc-install-'));
  try {
    fs.cpSync(source, staging, { recursive: true, force: false, errorOnExist: true });
    fs.renameSync(staging, destination);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [agent, project, ...extra] = process.argv.slice(2);
  if (agent === '--help' || agent === '-h') {
    console.log('Usage: node scripts/install.mjs <codex|claude> [project-directory]\n\nInstalls only into .agents/skills/planc or .claude/skills/planc inside the project.');
  } else {
    try {
      if (extra.length) throw new Error('Too many arguments. Usage: install.mjs <codex|claude> [project-directory]');
      const destination = install(agent, project);
      console.log(`Installed ${destination}\nRun the agent from this project to use planc.`);
    } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
  }
}
