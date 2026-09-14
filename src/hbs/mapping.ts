import { CsvToJson } from 'dff-util';

export const HBS_BASE = 'https://raw.githubusercontent.com/dfftech/sss-hbs/main';

export type MappingRow = {
  type: string;
  path: string;
  name: string;
  prefix: string;
  overwrite: boolean;
  hbs: boolean;
};

export type FetchText = (url: string) => Promise<string>;

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

export function parseMapping(csv: string): MappingRow[] {
  const data = CsvToJson(csv);
  if (!data.length) throw new Error('mapping.csv has no rows.');
  const header = Object.keys(data[0]!).join(',');
  if (header !== 'type,path,name,prefix,overwrite,hbs') {
    throw new Error('Unexpected mapping.csv header. Expected type,path,name,prefix,overwrite,hbs.');
  }
  return data.map((row, index) => {
    const type = cell(row.type);
    const path = cell(row.path);
    const name = cell(row.name);
    if (!type || !path || !name) throw new Error(`Invalid mapping.csv row ${index + 2}: type, path, and name are required.`);
    return {
      type,
      path,
      name,
      prefix: cell(row.prefix),
      overwrite: flag(row.overwrite, 'overwrite', index + 2),
      hbs: flag(row.hbs, 'hbs', index + 2),
    };
  });
}

export async function loadMapping(getText: FetchText = fetchText): Promise<MappingRow[]> {
  return parseMapping(await getText(`${HBS_BASE}/mapping.csv`));
}

export function mappingTypes(rows: MappingRow[]): string[] {
  return [...new Set(rows.map(row => row.type))];
}

export function mappingCommands(rows: MappingRow[]): string[] {
  return mappingTypes(rows).map(type => `hbs-${type}`);
}

function cell(value: string | boolean | number | null | undefined): string {
  if (value == null) return '';
  return String(value).trim().replace(/\u00a0/g, ' ');
}

function flag(value: string | boolean | number | null | undefined, field: string, row: number): boolean {
  if (value === true || cell(value) === 'true') return true;
  if (value === false || cell(value) === 'false') return false;
  throw new Error(`Invalid mapping.csv row ${row}: ${field} must be true or false.`);
}
