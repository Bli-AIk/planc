import { build } from 'esbuild';
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
const frontend = await build({ entryPoints: ['web/app.ts'], bundle: true, minify: true, outfile: 'dist/app.js', target: 'es2022', legalComments: 'linked', metafile: true });
for (const file of ['index.html', 'style.css']) await copyFile(`web/${file}`, `dist/${file}`);
await mkdir('skill/planc/scripts', { recursive: true });
await mkdir('skill/planc/dist', { recursive: true });
const cli = await build({ entryPoints: ['src/cli.js'], bundle: true, platform: 'node', format: 'cjs', outfile: 'skill/planc/scripts/planc.cjs', target: 'node22', metafile: true });
for (const file of ['index.html', 'style.css', 'app.js', 'app.js.LEGAL.txt']) await copyFile(`dist/${file}`, `skill/planc/dist/${file}`);
await copyFile('src/schema.json', 'skill/planc/references/schema.json');
await copyFile('LICENSE', 'skill/planc/LICENSE');
const packages = new Set(Object.keys({ ...frontend.metafile.inputs, ...cli.metafile.inputs }).filter(name => name.startsWith('node_modules/')).map(name => name.split('/').slice(0, name.startsWith('node_modules/@') ? 3 : 2).join('/')));
const notices = [];
for (const dir of [...packages].sort()) {
  const metadata = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
  const license = (await readdir(dir)).find(name => /^licen[sc]e(?:[-.].*)?$/i.test(name));
  if (!license) throw new Error(`Missing distribution license for ${metadata.name}`);
  notices.push(`${metadata.name} ${metadata.version}\n${'='.repeat(60)}\n${await readFile(`${dir}/${license}`, 'utf8')}`);
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
await copyFile('dist/THIRD_PARTY_NOTICES.txt', 'skill/planc/THIRD_PARTY_NOTICES.txt');
