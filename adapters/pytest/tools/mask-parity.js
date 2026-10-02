// Runs the real src/mask.ts on inputs from stdin and prints the results as JSON.
// Input:  {"extraKeys": [...], "strings": [...], "values": [...], "csv": [...]}
// Output: {"strings": [...], "values": [...], "csv": [...], "sensitive": {...}}
// tests/test_contract.py compares this with masking.py.
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'mask.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
const { makeMasker, parseCsv } = mod.exports;

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const m = makeMasker(input.extraKeys || []);
const sensitive = {};
for (const k of input.keys || []) sensitive[k] = m.isSensitive(k);
process.stdout.write(JSON.stringify({
  strings: (input.strings || []).map(s => m.maskStr(s)),
  values: (input.values || []).map(v => m.mask(v)),
  csv: (input.csv || []).map(c => parseCsv(c)),
  sensitive,
}));
