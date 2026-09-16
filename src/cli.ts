#!/usr/bin/env bun
import { toPascalCase } from 'dff-util';
import { generateHbs, hbsTypeFromCommand, parseData, type GenerateDeps } from './hbs/generate';
import { fetchText, loadMapping, mappingCommands } from './hbs/mapping';

const usage = `Usage: bunx dff-script <list|hbs-<type>> [data]
Generate files from sss-hbs mapping in the current directory.

Example:
  bunx dff-script hbs-cd-ms '{"tenant":"dff","module":"astropeace","name":"auth","type":"ms"}'
  bunx dff-script hbs-cd-ms dff:astropeace:auth:ms
  bunx dff-script hbs-web-module user`;

export async function run(args = process.argv.slice(2), deps: GenerateDeps = {}) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]!))) {
    console.log(usage);
    return;
  }
  try {
    const getText = deps.fetchText ?? fetchText;
    if (args[0] === 'list' && args.length === 1) {
      const commands = mappingCommands(await loadMapping(getText));
      console.log('Available commands:');
      for (const command of commands) console.log(`  ${command}`);
      console.log('\nRun: bunx dff-script hbs-<type> [data]');
      return;
    }
    const type = hbsTypeFromCommand(args[0] ?? '');
    if (!type || args.length > 2) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }
    const data = args[1] ? parseData(args[1]) : {};
    const { created, skipped } = await generateHbs(type, data, process.cwd(), deps);
    console.log(`DFF ${toPascalCase(type)}`);
    if (created.length) console.log(created.map(file => `Created ${file}`).join('\n'));
    if (skipped.length) console.log(skipped.map(file => `Skipped ${file} (already exists)`).join('\n'));
    if (!created.length && !skipped.length) console.log('No files mapped for this type.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) await run();
