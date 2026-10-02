// Type-check report.json files against ReportData in ../../../src/types.ts.
// Usage: node check-report.js <report.json> [<report.json> ...]
//
// Each file becomes `const data: ReportData = <the JSON>;` in .out/. An object literal gets
// TypeScript's strict checks: literal unions ('passed' | 'failed' ...) and no unknown keys.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node check-report.js <report.json> ...'); process.exit(2); }

const out = path.join(__dirname, '.out');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const types = path.relative(out, path.resolve(__dirname, '..', '..', '..', 'src', 'types')).split(path.sep).join('/');

files.forEach((file, i) => {
  const json = fs.readFileSync(file, 'utf8');
  JSON.parse(json); // fail early on invalid JSON
  fs.writeFileSync(path.join(out, `report${i}.ts`),
    `import type { ReportData } from '${types}';\n// from ${path.resolve(file)}\nconst data: ReportData = ${json};\nexport default data;\n`);
});

const tsc = require.resolve('typescript/bin/tsc');
try {
  execFileSync(process.execPath, [tsc, '-p', path.join(__dirname, 'tsconfig.json')], { stdio: 'inherit' });
  console.log(`ok: ${files.length} report${files.length === 1 ? '' : 's'} match ReportData`);
} catch {
  process.exit(1);
}
