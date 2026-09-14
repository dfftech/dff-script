import { CallHbs, type RequestBodyType } from 'dff-util';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fetchText, HBS_BASE, loadMapping, type FetchText, type MappingRow } from './mapping';

export type HbsData = RequestBodyType;

export type GenerateResult = {
  created: string[];
  skipped: string[];
};

export type GenerateDeps = {
  fetchText?: FetchText;
  render?: (template: string, data: HbsData) => string | Promise<string>;
};

export async function generateHbs(
  type: string,
  data: HbsData,
  cwd: string,
  deps: GenerateDeps = {},
): Promise<GenerateResult> {
  const getText = deps.fetchText ?? fetchText;
  const render = deps.render ?? renderHbs;
  const rows = (await loadMapping(getText)).filter(row => row.type === type);
  if (!rows.length) throw new Error(`Unknown type: ${type}. Run list to see available hbs commands.`);
  const root = resolve(cwd);
  const planned = await Promise.all(rows.map(row => planFile(row, data, root, getText, render)));

  for (const file of planned) await assertSafePath(root, file.path, file.relative);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of planned) {
    if (!file.overwrite && await Bun.file(file.path).exists()) {
      skipped.push(file.relative);
      continue;
    }
    await Bun.write(file.path, file.content);
    created.push(file.relative);
  }
  return { created, skipped };
}

export function parseData(raw: string): HbsData {
  const text = raw.trim();
  if (!text) return {};
  try {
    return asObject(JSON.parse(text));
  } catch {
    const quoted = text.replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":');
    try {
      return asObject(JSON.parse(quoted));
    } catch {
      throw new Error('Data must be a JSON object, for example {"tenant":"dff","module":"astropeace","name":"auth","type":"ms"}.');
    }
  }
}

export function hbsTypeFromCommand(command: string): string | undefined {
  if (!command.startsWith('hbs-')) return;
  const type = command.slice('hbs-'.length);
  return type || undefined;
}

async function renderHbs(template: string, data: HbsData): Promise<string> {
  const result = await CallHbs(template, data);
  if (typeof result !== 'string') throw new Error('HBS rendering returned multiple results.');
  return result;
}

async function planFile(
  row: MappingRow,
  data: HbsData,
  root: string,
  getText: FetchText,
  render: (template: string, data: HbsData) => string | Promise<string>,
) {
  const source = `${HBS_BASE}/${row.type}/${row.name}.hbs`;
  const template = await getText(source);
  const content = row.hbs ? await render(template, data) : template;
  const prefix = row.prefix.includes('{{') ? await render(row.prefix, data) : row.prefix;
  if (/[\\/]/.test(prefix)) throw new Error(`Prefix must not contain path separators: ${prefix}`);
  const relativePath = join(row.path, `${prefix}${row.name}`);
  return { ...row, content, relative: relativePath, path: join(root, relativePath) };
}

async function assertSafePath(root: string, path: string, name: string) {
  const relativePath = relative(root, path);
  if (!relativePath || relativePath.startsWith('..') || relativePath.split(sep).includes('..')) {
    throw new Error(`Refusing to write outside the project: ${name}`);
  }
  let current = root;
  for (const part of relative(root, dirname(path)).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    const dir = Bun.file(current);
    if (!await dir.exists()) continue;
    const stat = await dir.stat();
    if (!stat.isDirectory()) throw new Error(`Unsafe directory: ${current}`);
  }
  const dest = Bun.file(path);
  if (await dest.exists()) {
    const stat = await dest.stat();
    if (!stat.isFile()) throw new Error(`Not a regular file: ${name}`);
  }
}

function asObject(value: unknown): HbsData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Data must be a JSON object.');
  }
  return value as HbsData;
}
