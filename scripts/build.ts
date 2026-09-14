import { chmod } from 'node:fs/promises';
const result = await Bun.build({
  entrypoints: ['src/cli.ts'],
  outdir: 'dist',
  target: 'bun',
  minify: false,
});
if (!result.success) throw new AggregateError(result.logs, 'Build failed');
await chmod('dist/cli.js', 0o755);
