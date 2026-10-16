/**
 * playwright-bdd (github.com/vitalets/playwright-bdd): its tests run on the Playwright runner, so they reach the
 * reporter as ordinary tests in generated spec files (.features-gen/…/x.feature.spec.js). Each generated file carries
 * the feature file it came from (`$uri`) and a `bddFileData` block: for every test its line in the feature file, its
 * tags, and every step with its line in the feature file.
 *
 * With that and the feature file itself, a scenario becomes a report row like the Cucumber ones elsewhere: at its
 * line in the .feature file, under its Feature and Rule, Outline rows named after their values with the row as an
 * Examples table, data tables and doc strings as test data, Background steps next to the scenario's own, the steps a
 * failure left unrun greyed out, and an error in the generated file pointed at the step in the feature file.
 *
 * Read only, and never fatal: a file that is not a playwright-bdd spec (or a format this does not know) is left as
 * it is.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ErrorData, ResultData, StepData, TestData } from './types';

interface BddStep { pwStepLine: number; gherkinStepLine: number; textWithKeyword: string; isBg?: boolean }
interface BddTest { pwTestLine: number; pickleLine: number; tags?: string[]; steps: BddStep[] }
interface BddSpec { uri: string; feature: string; tests: BddTest[]; /** playwright-bdd 7: by "describe|…|test" title */ byTitle?: Map<string, BddTest> }
type Masker = { maskStr(s: string): string; isSensitive(k: string): boolean; learn(v: string): void };

const specCache = new Map<string, BddSpec | null>();
const linesCache = new Map<string, string[]>();

function lines(file: string): string[] {
  let l = linesCache.get(file);
  if (!l) { try { l = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { l = []; } linesCache.set(file, l); }
  return l;
}

/** The bdd data of a generated spec file, or null when it is not one. */
export function bddSpec(specFile: string, roots: string[]): BddSpec | null {
  if (specCache.has(specFile)) return specCache.get(specFile)!;
  let out: BddSpec | null = null;
  try {
    const src = fs.readFileSync(specFile, 'utf8');
    const uri = /\$uri:\s*\[?\(\{\}, use\) => use\((['"])(.+?)\1\)/.exec(src)?.[2] ?? /^\/\/ Generated from: (.+)$/m.exec(src)?.[1]?.trim();
    // $uri is relative to the config folder; try the usual roots
    const feature = uri ? [...roots, path.dirname(specFile)].map(r => path.resolve(r, uri)).find(f => fs.existsSync(f)) : undefined;
    const block = /bdd-data-start\s*\n([\s\S]*?)\n\s*\]; \/\/ bdd-data-end/.exec(src);   // playwright-bdd 8+
    const meta = /const bddFileMeta = (\{[\s\S]*?\n\});/.exec(src);                       // playwright-bdd 7
    if (uri && feature && block) {
      const tests = JSON.parse('[' + block[1].trim().replace(/,\s*$/, '') + ']') as BddTest[];
      if (Array.isArray(tests)) out = { uri, feature, tests };
    } else if (uri && feature && meta) {
      const byTitle = new Map<string, BddTest>();
      for (const [k, v] of Object.entries(JSON.parse(meta[1].replace(/,(\s*\})$/, '$1')) as Record<string, { pickleLocation?: string; tags?: string[] }>)) {
        const line = parseInt(String(v?.pickleLocation ?? ''), 10);
        if (line > 0) byTitle.set(k, { pwTestLine: 0, pickleLine: line, tags: v.tags, steps: [] });
      }
      out = { uri, feature, tests: [], byTitle };
    }
  } catch { out = null; }
  specCache.set(specFile, out);
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim().replace(/\\\|/g, '|'));
const isRow = (l: string | undefined) => !!l && /^\s*\|/.test(l);

/** The Examples header and the row at `line` (1-based), when that line is an Examples row. */
function exampleAt(src: string[], line: number): { header: string[]; values: string[]; outline?: string } | undefined {
  if (!isRow(src[line - 1])) return undefined;
  let top = line;
  while (top > 1 && isRow(src[top - 2])) top--;
  if (top === line) return undefined;   // the header row itself
  let outline: string | undefined;
  for (let i = top - 2; i >= 0; i--) {
    const m = /^\s*(?:Scenario Outline|Scenario Template|Scenario|Example):\s*(.*)$/.exec(src[i]);
    if (m) { outline = m[1].trim(); break; }
  }
  return { header: cells(src[top - 1]), values: cells(src[line - 1]), outline };
}

/** The data table or doc string right under the step at `line`. */
function argumentAt(src: string[], line: number): { table?: string[][]; docString?: string } | undefined {
  let i = line;   // the line after the step (0-based index = line)
  while (i < src.length && !src[i].trim()) i++;
  if (isRow(src[i])) {
    const rows: string[][] = [];
    while (isRow(src[i])) rows.push(cells(src[i++]));
    return { table: rows };
  }
  const open = /^(\s*)("""|```)/.exec(src[i] ?? '');
  if (open) {
    const indent = open[1].length, fence = open[2], body: string[] = [];
    for (i++; i < src.length && !src[i].trim().startsWith(fence); i++) body.push(src[i].slice(Math.min(indent, src[i].search(/\S|$/))));
    return { docString: body.join('\n') };
  }
  return undefined;
}

function frame(src: string[], line: number): string | undefined {
  if (line < 1 || line > src.length) return undefined;
  const lo = Math.max(1, line - 2), hi = Math.min(src.length, line + 2), w = String(hi).length;
  const rows: string[] = [];
  for (let n = lo; n <= hi; n++) rows.push(`${n === line ? '>' : ' '} ${String(n).padStart(w)} | ${src[n - 1]}`);
  return rows.join('\n');
}

/**
 * Turns a playwright-bdd test into a scenario row. `specFile` is the generated spec (absolute), `rel` makes a path
 * relative the way the rest of the report does, `masker` is the report's masker.
 */
export function applyBdd(t: TestData, specFile: string, roots: string[], rel: (f: string) => string, masker: Masker): boolean {
  const spec = bddSpec(specFile, roots);
  if (!spec) return false;
  const bt = spec.tests.find(x => x.pwTestLine === t.line) ?? spec.byTitle?.get([...t.path.slice(1), t.title].join('|'));
  if (!bt) return false;
  const src = lines(spec.feature);
  const generated = rel(specFile);

  // a tag that became meta (@P1, @critical, @owner:asha) is not also a tag chip, as in the other Cucumber reports
  t.tags = t.tags.filter(g => {
    const tag = g.replace(/^@/, '');
    const kv = /^([a-z_-]+)[:=](.+)$/i.exec(tag);
    if (kv) return !(kv[1].toLowerCase() in t.meta);
    if (/^P[0-4]$/i.test(tag)) return !t.meta.priority;
    if (/^(blocker|critical|major|minor|trivial)$/i.test(tag)) return !t.meta.severity;
    return true;
  });

  t.file = rel(spec.feature);
  t.line = bt.pickleLine;
  t.column = undefined;

  // Rule: blocks keep their label in the breadcrumb; an Outline's own describe is folded into the title
  const rules = new Set(src.map(l => /^\s*Rule:\s*(.*)$/.exec(l)?.[1]?.trim()).filter(Boolean) as string[]);
  const ex = exampleAt(src, bt.pickleLine);
  t.path = t.path.filter(p => !(ex?.outline && (p === ex.outline || p === masker.maskStr(ex.outline)))).map(p => rules.has(p) ? 'Rule: ' + p : p);

  const data: ResultData['data'] = [];
  const table = (name: string, header: string[], rows: string[][]) => {
    const sens = header.map(h => masker.isSensitive(h));
    const masked = rows.map(r => r.map((c, i) => { if (sens[i]) { masker.learn(c); return '****'; } return masker.maskStr(c); }));
    data.push({ name: masker.maskStr(name), kind: 'table', columns: header.map(h => masker.maskStr(h)), rows: masked });
  };
  if (ex) {
    table('Examples', ex.header, [ex.values]);
    const vals = ex.values.join(', ');
    const base = /^Example #\d+$/.test(t.title) && ex.outline ? ex.outline : t.title;
    t.title = masker.maskStr(`${base} (${vals.length > 60 ? vals.slice(0, 60) + '…' : vals})`);
  }
  for (const st of bt.steps) {
    const arg = argumentAt(src, st.gherkinStepLine);
    if (arg?.table && arg.table.length) {
      const [head, ...rest] = arg.table;
      if (rest.length) table(st.textWithKeyword, head, rest);
      else data.push({ name: masker.maskStr(st.textWithKeyword), kind: 'table', columns: head.map(c => masker.maskStr(c)), rows: [] });
    } else if (typeof arg?.docString === 'string') {
      data.push({ name: masker.maskStr(st.textWithKeyword), kind: 'text', text: masker.maskStr(arg.docString) });
    }
  }

  for (const r of t.results) {
    if (data.length) r.data.push(...data.map(d => ({ ...d })));
    r.steps = scenarioSteps(r, bt, masker);
    for (const e of r.errors) pointAtFeature(e, generated, bt, t.file, src, masker);
    // a step with no definition never starts: it is the failing step, not one left unrun
    const missing = r.errors.map(e => /Missing step:\s*(.+)$/m.exec(e.message)?.[1]?.trim()).find(Boolean);
    if (missing) {
      const st = r.steps.find(x => x.status === 'skipped' && x.title === masker.maskStr(missing));
      if (st) { delete st.status; st.error = masker.maskStr(`Missing step: ${missing}`); }
    }
  }
  return true;
}

/** Background steps (run in a beforeEach hook) next to the scenario's own, then the steps that did not run.
 *  Gherkin steps are known by their text (keyword included, in whatever language the feature file is written). */
function scenarioSteps(r: ResultData, bt: BddTest, masker: Masker): StepData[] {
  const texts = new Set(bt.steps.map(s => masker.maskStr(s.textWithKeyword)));
  const isGherkin = (s: StepData) => s.category === 'test.step' && texts.has(s.title);
  const out = [...r.steps];
  const before = out.findIndex(s => s.category === 'hook' && /^Before Hooks$/.test(s.title));
  const bg: StepData[] = [];
  if (before >= 0) {
    const hooks = out[before];
    const pull = (list: StepData[]): StepData[] => list.filter(s => {
      if (s.category === 'hook' && s.title === 'Background') {
        s.steps = s.steps.filter(c => { if (isGherkin(c)) { bg.push(c); return false; } return true; });
      } else s.steps = pull(s.steps);
      return true;
    });
    hooks.steps = pull(hooks.steps);
    if (bg.length) out.splice(before + 1, 0, ...bg);
  }
  const ran = out.filter(isGherkin).length;
  const missing = bt.steps.slice(ran);
  if (missing.length && r.status !== 'passed') {
    const after = out.findIndex(s => s.category === 'hook' && /^After Hooks$/.test(s.title));
    const skipped = missing.map(m => ({ title: masker.maskStr(m.textWithKeyword), category: 'test.step', duration: 0, status: 'skipped' as const, steps: [] }));
    out.splice(after >= 0 ? after : out.length, 0, ...skipped);
  }
  return out;
}

/** An error located in the generated spec (a missing step, a step that threw there) points at the feature file. */
function pointAtFeature(e: ErrorData, generated: string, bt: BddTest, featureRel: string, src: string[], masker: Masker): void {
  if (!e.location || e.location.file !== generated) return;
  const st = bt.steps.find(s => s.pwStepLine === e.location!.line);
  const line = st?.gherkinStepLine ?? bt.pickleLine;
  e.location = { file: featureRel, line, column: 0 };
  const snip = frame(src, line);
  if (snip) e.snippet = masker.maskStr(snip);
}
