import { build } from 'esbuild';
import { mkdir, copyFile, readFile, readdir, writeFile } from 'node:fs/promises';
import MarkdownIt from 'markdown-it';
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
  // These packages distribute their full license text in the README.
  const license = (await readdir(dir)).find(name => /^licen[sc]e(?:[-.].*)?$/i.test(name)) || (['heap', 'pathfinding'].includes(metadata.name) ? 'README.md' : undefined);
  if (!license) throw new Error(`Missing distribution license for ${metadata.name}`);
  let licenseText = (await readFile(`${dir}/${license}`, 'utf8')).replaceAll('\r\n', '\n');
  if (license === 'README.md') {
    const tokens = new MarkdownIt().parse(licenseText, {});
    const heading = tokens.find((token, i) => token.type === 'heading_open' && /^license$/i.test(tokens[i + 1]?.content));
    if (!heading?.map) throw new Error(`Missing license section for ${metadata.name}`);
    licenseText = licenseText.split('\n').slice(heading.map[1]).join('\n').trim();
  }
  notices.push(`${metadata.name} ${metadata.version}\n${'='.repeat(60)}\n${licenseText}`);
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices.join('\n\n'));
await copyFile('dist/THIRD_PARTY_NOTICES.txt', 'skill/planc/THIRD_PARTY_NOTICES.txt');
