import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JsonToCsv } from 'dff-util';
import { run } from '../src/cli';
import { generateHbs, hbsTypeFromCommand, parseData, type HbsData } from '../src/hbs/generate';
import { mappingCommands, mappingTypes, parseMapping } from '../src/hbs/mapping';

const mappingCsv = `type,path,name,prefix,overwrite,hbs
gitignore,.,.gitignore,,true,false
cd-config,cd,config.yaml,,false,true
cd-config,cd,cred.yaml,,false,true
cd-ms,cd,deploy.yaml,{{to_kebab_case module}}-{{to_kebab_case name}}-{{to_kebab_case type}}.,false,true
cd-ms,cd,svc.yaml,{{to_kebab_case module}}-{{to_kebab_case name}}-{{to_kebab_case type}}.,false,true
web-module,modules/{{to_kebab_case name}},module.page.tsx,,false,true
web-module,modules/{{to_kebab_case name}}/components,list.tsx,{{to_kebab_case name}}.,false,true
`;

const data = { tenant: 'dff', module: 'astropeace', name: 'auth', type: 'ms' };
const dirs: string[] = [];
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), 'dff-hbs-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

function render(template: string, values: HbsData) {
  return template.replace(/\{\{to_kebab_case (\w+)\}\}/g, (_, key) => String(values[key] ?? '').toLowerCase());
}

async function fetchText(url: string) {
  if (url.endsWith('/mapping.csv')) return mappingCsv;
  if (url.endsWith('/cd-ms/deploy.yaml.hbs')) return 'deploy {{to_kebab_case name}}';
  if (url.endsWith('/cd-ms/svc.yaml.hbs')) return 'svc {{to_kebab_case name}}';
  if (url.endsWith('/cd-config/config.yaml.hbs')) return 'config {{to_kebab_case module}}';
  if (url.endsWith('/cd-config/cred.yaml.hbs')) return 'cred {{to_kebab_case tenant}}';
  if (url.endsWith('/web-module/module.page.tsx.hbs')) return 'page {{to_kebab_case name}}';
  if (url.endsWith('/web-module/list.tsx.hbs')) return 'list {{to_kebab_case name}}';
  if (url.endsWith('/gitignore/.gitignore.hbs')) return 'node_modules/\n';
  throw new Error(`unexpected fetch ${url}`);
}

const deps = { fetchText, render };

test('mapping parser reads path, prefix, overwrite, and hbs flags', () => {
  const rows = parseMapping(mappingCsv);
  expect(mappingTypes(rows)).toEqual(['gitignore', 'cd-config', 'cd-ms', 'web-module']);
  expect(mappingCommands(rows)).toEqual(['hbs-gitignore', 'hbs-cd-config', 'hbs-cd-ms', 'hbs-web-module']);
  expect(hbsTypeFromCommand('hbs-cd-config')).toBe('cd-config');
  expect(hbsTypeFromCommand('hbs-cd-ms')).toBe('cd-ms');
  expect(rows.filter(row => row.type === 'cd-ms').map(row => row.name)).toEqual(['deploy.yaml', 'svc.yaml']);
});

test('JsonToCsv roundtrips mapping rows back through CsvToJson', () => {
  const rows = parseMapping(mappingCsv);
  expect(parseMapping(JsonToCsv(rows))).toEqual(rows);
});

test('list prints every mapping type with an hbs- prefix', async () => {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    await run(['list'], { fetchText });
  } finally {
    console.log = log;
  }
  const text = lines.join('\n');
  expect(text).toContain('hbs-gitignore');
  expect(text).toContain('hbs-cd-config');
  expect(text).toContain('hbs-cd-ms');
});

test('hbs-cd-config writes mapped config files', async () => {
  const dir = await temp();
  const result = await generateHbs('cd-config', data, dir, deps);
  expect(result.created.sort()).toEqual(['cd/config.yaml', 'cd/cred.yaml'].sort());
  expect(await readFile(join(dir, 'cd/config.yaml'), 'utf8')).toBe('config astropeace');
  expect(await readFile(join(dir, 'cd/cred.yaml'), 'utf8')).toBe('cred dff');
});

test('hbs-cd-ms writes prefixed files from mapping and CallHbs output', async () => {
  const dir = await temp();
  const result = await generateHbs('cd-ms', data, dir, deps);
  expect(result.created.sort()).toEqual([
    'cd/astropeace-auth-ms.deploy.yaml',
    'cd/astropeace-auth-ms.svc.yaml',
  ].sort());
  expect(await readFile(join(dir, 'cd/astropeace-auth-ms.deploy.yaml'), 'utf8')).toBe('deploy auth');
  expect(await readFile(join(dir, 'cd/astropeace-auth-ms.svc.yaml'), 'utf8')).toBe('svc auth');
});

test('hbs-web-module accepts a plain module name and renders paths', async () => {
  const dir = await temp();
  const result = await generateHbs('web-module', parseData('user'), dir, deps);
  expect(result.created.sort()).toEqual([
    'modules/user/components/user.list.tsx',
    'modules/user/module.page.tsx',
  ].sort());
  expect(await readFile(join(dir, 'modules/user/module.page.tsx'), 'utf8')).toBe('page user');
  expect(await readFile(join(dir, 'modules/user/components/user.list.tsx'), 'utf8')).toBe('list user');
});

test('hbs-web-module also accepts a JSON string module name', async () => {
  const dir = await temp();
  const result = await generateHbs('web-module', parseData('"adminUser"'), dir, deps);
  expect(result.created.sort()).toEqual([
    'modules/adminuser/components/adminuser.list.tsx',
    'modules/adminuser/module.page.tsx',
  ].sort());
});

test('hbs false copies the template without rendering', async () => {
  const dir = await temp();
  const result = await generateHbs('gitignore', {}, dir, deps);
  expect(result.created).toEqual(['.gitignore']);
  expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n');
});

test('overwrite false skips existing files; overwrite true replaces them', async () => {
  const dir = await temp();
  await mkdir(join(dir, 'cd'));
  await writeFile(join(dir, 'cd/config.yaml'), 'keep me');
  const skipped = await generateHbs('cd-config', data, dir, deps);
  expect(skipped).toEqual({ created: ['cd/cred.yaml'], skipped: ['cd/config.yaml'] });
  expect(await readFile(join(dir, 'cd/config.yaml'), 'utf8')).toBe('keep me');

  await writeFile(join(dir, '.gitignore'), 'old');
  const replaced = await generateHbs('gitignore', {}, dir, deps);
  expect(replaced.created).toEqual(['.gitignore']);
  expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n');
});

test('unknown type fails before writing files', async () => {
  const dir = await temp();
  await expect(generateHbs('missing', data, dir, deps)).rejects.toThrow('Unknown type: missing');
  expect(await readdir(dir)).toEqual([]);
});

test('cannot write through a path that is not a directory', async () => {
  const dir = await temp();
  await Bun.write(join(dir, 'cd'), 'not a directory');
  await expect(generateHbs('cd-ms', data, dir, deps)).rejects.toThrow('Unsafe directory');
});

test('parseData accepts JSON and unquoted object keys', () => {
  expect(parseData('{"tenant":"dff","name":"auth"}')).toEqual({ tenant: 'dff', name: 'auth' });
  expect(parseData('{tenant:"dff", module:"astropeace", name:"auth", type:"ms"}')).toEqual(data);
  expect(parseData('user')).toEqual({ name: 'user' });
  expect(parseData('"user"')).toEqual({ name: 'user' });
  expect(() => parseData('["user"]')).toThrow('Data must be a JSON object');
});

test('parseData accepts colon shorthand strings', () => {
  expect(parseData('dff:astropeace:auth:ms')).toEqual(data);
  expect(parseData('dff:astropeace:auth')).toEqual({ tenant: 'dff', module: 'astropeace', name: 'auth' });
  expect(parseData('dff:astropeace')).toEqual({ tenant: 'dff', module: 'astropeace' });
  expect(parseData('"dff:astropeace:auth:ms"')).toEqual(data);
  expect(() => parseData('dff:')).toThrow('String data must be a name or tenant:module');
  expect(() => parseData('dff:astropeace:auth:ms:extra')).toThrow('String data must be a name or tenant:module');
});

test('CLI help and invalid commands do not create files', async () => {
  const dir = await temp();
  const help = Bun.spawnSync([process.execPath, resolve('dist/cli.js'), '--help'], { cwd: dir });
  expect(help.exitCode).toBe(0);
  expect(help.stdout.toString()).toContain('hbs-<type>');
  const bad = Bun.spawnSync([process.execPath, resolve('dist/cli.js'), 'web-ci'], { cwd: dir });
  expect(bad.exitCode).toBe(1);
  expect(await readdir(dir)).toEqual([]);
});
