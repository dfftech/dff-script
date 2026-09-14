# dff-script

A Bun 1.4 CLI that generates files from [sss-hbs](https://github.com/dfftech/sss-hbs) templates. Mapping and Handlebars sources are read from that repository. CSV mapping uses `CsvToJson` from `dff-util`; rendering uses `CallHbs`.

```sh
bunx dff-script list
bunx dff-script hbs-cd-config '{"tenant":"dff","module":"astropeace"}'
bunx dff-script hbs-cd-ms '{"tenant":"dff","module":"astropeace","name":"auth","type":"ms"}'
```

`list` reads [mapping.csv](https://github.com/dfftech/sss-hbs/blob/main/mapping.csv) and prints every type with an `hbs-` prefix, for example `hbs-cd-config`, `hbs-cd-ms`, and `hbs-gitignore`.

Unquoted object keys are also accepted:

```sh
bunx dff-script hbs-cd-ms '{tenant:"dff", module:"astropeace", name:"auth", type:"ms"}'
```

These registry commands work after the package is published. To run from this repository now:

```sh
bun install
bun run build
cd /path/to/your/app
bun /Volumes/work/github/dff-script/dist/cli.js list
bun /Volumes/work/github/dff-script/dist/cli.js hbs-cd-config '{"tenant":"dff","module":"astropeace"}'
bun /Volumes/work/github/dff-script/dist/cli.js hbs-cd-ms '{"tenant":"dff","module":"astropeace","name":"auth","type":"ms"}'
```

`list` and each `hbs-<type>` command start from [mapping.csv](https://github.com/dfftech/sss-hbs/blob/main/mapping.csv). The `hbs-` prefix is stripped to get the mapping type (`hbs-cd-ms` → `cd-ms`). Matching rows drive path, filename prefix, overwrite, and whether the file is rendered.

| Column | Role |
| --- | --- |
| `type` | Selected by the command after `hbs-` |
| `path` | Directory under the current project (`.` is the project root) |
| `name` | Output filename, after an optional rendered prefix |
| `prefix` | Optional Handlebars prefix rendered with `CallHbs` |
| `overwrite` | `true` replaces an existing file; `false` leaves it in place |
| `hbs` | `true` renders the template with `CallHbs`; `false` copies it as-is |
