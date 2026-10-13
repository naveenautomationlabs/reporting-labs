/**
 * reportingLabs support file for Cypress: runs in the browser, next to your tests.
 *
 *   // cypress/support/e2e.js
 *   import 'reporting-labs/cypress/support';
 *
 * For every attempt of every test it collects what the Node-side plugin cannot see, and hands it over in an
 * afterEach hook (cy.task, not logged):
 *   - the Cypress commands as steps (cy.get → type / click, assertions), hooks grouped, timings, the failing step
 *   - cy.request calls with their request and response, and the app's own fetch / XHR calls, for the API tab
 *   - the error of every attempt with Cypress's code frame (the Node side only gets the last one)
 *   - meta({ owner, priority, … }) called in the test
 *   - with @badeball/cypress-cucumber-preprocessor: the Gherkin steps (Given / When / Then) with the commands each ran,
 *     Before / After hooks, the steps a failure left unrun, and the scenario's line, tags, example row, data tables
 * A value typed into a password field is masked here; everything else is masked by the plugin with the report's
 * masking rules. Nothing in this file may ever fail a test: every handler is guarded.
 *
 * In a spec:  import { meta } from 'reporting-labs/cypress/support';  …  meta({ owner: 'asha', priority: 'P1' });
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Cypress: any;
declare const cy: any;
declare function afterEach(fn: (this: any) => void): void;

interface CyLog { get(key?: string): any; invoke?(key: string): any }
interface Collected { log: CyLog; start: number; hook?: string; masked?: boolean }
interface Step { title: string; category: string; duration: number; error?: string; status?: 'skipped'; steps: Step[] }
interface Api { method: string; url: string; status?: number; duration?: number; requestHeaders?: Record<string, string>; requestBody?: unknown; responseHeaders?: Record<string, string>; responseBody?: unknown }

const TASK = 'reportingLabs:attempt';
const ENABLED_FLAG = 'reportingLabsEnabled';
let logs: Collected[] = [];
let currentMeta: Record<string, unknown> = {};

/** Meta for the running test: priority, severity, owner, feature, story, issue… The same keys as meta() in Playwright. */
export function meta(values: Record<string, unknown>): void {
  try { if (values && typeof values === 'object') Object.assign(currentMeta, values); } catch { /* never fail a test */ }
}

const guard = (fn: () => void) => { try { fn(); } catch { /* never fail a test */ } };

if (typeof Cypress !== 'undefined') {
  Cypress.on('test:before:run', () => guard(() => { logs = []; currentMeta = {}; }));

  Cypress.on('log:added', (_attrs: any, log: CyLog) => guard(() => {
    const runnable = Cypress.state && Cypress.state('runnable');
    const hook = runnable && runnable.type === 'hook' ? String(runnable.hookName || runnable.title || 'hook') : undefined;
    const el = log.get('$el');
    const field = el && el[0];
    const masked = log.get('name') === 'type' && !!field && /^(password)$/i.test(String(field.type || ''));
    logs.push({ log, start: toMs(log.get('wallClockStartedAt')) || Date.now(), hook, masked });
  }));

  afterEach(function (this: any) {
    // only when the plugin is registered in setupNodeEvents (it sets this flag); otherwise cy.task would fail the test
    let enabled = false;
    try { enabled = typeof Cypress.expose === 'function' ? !!Cypress.expose(ENABLED_FLAG) : !!Cypress.env(ENABLED_FLAG); } catch { /* not enabled */ }
    if (!enabled) return;
    let payload: any;
    try { payload = build(this.currentTest); } catch { return; }
    // log: false keeps it out of the command log; a failed handover must not fail the test
    cy.task(TASK, payload, { log: false, timeout: 20000 });
  });
}

function build(t: any): any {
  const start = toMs(t.wallClockStartedAt) || (logs[0]?.start ?? Date.now());
  const duration = typeof t.duration === 'number' ? t.duration : Math.max(0, Date.now() - start);
  const err = t.err ? {
    message: String(t.err.message ?? t.err),
    stack: t.err.stack ? String(t.err.stack) : undefined,
    codeFrame: t.err.codeFrame ? { line: t.err.codeFrame.line, column: t.err.codeFrame.column, relativeFile: t.err.codeFrame.relativeFile, frame: t.err.codeFrame.frame } : undefined,
  } : undefined;
  const retry = typeof t.currentRetry === 'function' ? t.currentRetry() : (t._currentRetry ?? 0);
  return {
    spec: Cypress.spec && (Cypress.spec.relative || Cypress.spec.name),
    titlePath: typeof t.titlePath === 'function' ? t.titlePath() : [t.title],
    retry, state: t.state, start, duration, err,
    steps: steps(start + duration, err?.message, t),
    api: api(),
    meta: currentMeta,
    gherkin: gherkin(t),
  };
}

const clean = (s: unknown) => String(s ?? '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const SKIP = new Set(['new url', 'page load', 'route', 'xhr', 'fetch', 'task', 'log']);
const HOOKS = /^(Before|After|BeforeStep|AfterStep|BeforeAll|AfterAll)$/;

/** Commands as steps: hooks grouped, chained commands under their parent, assertions under what they check, commands
 *  inside a log group (a Gherkin step, cy.within, a custom command that opens a group) under that group. */
function steps(end: number, errMsg: string | undefined, t: any): Step[] {
  const g = scenario(t);
  const items = logs.filter(c => {
    const name = c.log.get('name');
    if (SKIP.has(name) && name !== 'route') return false;
    if (c.log.get('event')) return false;   // page loads, url changes, the app's own fetch / XHR (those go to the API tab)
    if (c.log.get('hidden')) return false;
    if (g && name === 'DataTable') return false;   // sent with the scenario (see gherkin())
    return true;
  });
  const out: Step[] = [];
  const parents = new Map<string, Step>();   // chainerId → parent step
  const groups = new Map<string, Step>();    // log id of a group → its step
  const up = new Map<Step, Step>();          // step → the step it is under
  // a step's time and failure count for every step it is under
  const add = (parent: Step, step: Step) => {
    parent.steps.push(step); up.set(step, parent);
    for (let p: Step | undefined = parent; p; p = up.get(p)) { p.duration += step.duration; if (step.error) p.error = step.error; }
  };
  let hookStep: Step | undefined, hookName: string | undefined;
  let ran = 0;   // Gherkin steps that started (the rest of the scenario's steps did not run)
  items.forEach((c, i) => {
    const next = items[i + 1];
    const name = String(c.log.get('name') || '');
    let message = clean(c.log.get('message'));
    if (c.masked) message = '****';
    if (name === 'request' && !message) message = clean(display(c.log));   // "POST 200 /api/users"
    const isAssert = name === 'assert';
    const group = !!c.log.get('groupStart');
    const inGroup = groups.get(String(c.log.get('group') ?? ''));
    const gherkinHook = !!g && group && HOOKS.test(name.trim());
    const gherkinStep = !!g && group && !gherkinHook && /^\*\*[\s\S]*\*\*$/.test(String(c.log.get('message') ?? '').trim());
    const step: Step = {
      title: gherkinHook ? `${name.trim()} hook${message ? ': ' + message : ''}`
        : gherkinStep ? `${name.trim()} ${message}`
        : name === 'route' ? clean(routeTitle(c.log)) : isAssert ? message : `${name}${message ? ' ' + message : ''}`,
      category: gherkinHook ? 'hook' : gherkinStep ? 'test.step' : isAssert ? 'assert' : 'cy',
      duration: Math.max(0, (next ? next.start : end) - c.start),
      steps: [],
    };
    if (gherkinStep && !inGroup) ran++;
    if (c.log.get('state') === 'failed') step.error = clean(errMsg || c.log.get('err')?.message || 'failed');
    // the hook it ran in: one step per hook, the commands inside
    let container: Step | undefined;
    if (c.hook) {
      if (!hookStep || hookName !== c.hook) { hookName = c.hook; hookStep = { title: `${camel(c.hook)} hook`, category: 'hook', duration: 0, steps: [] }; out.push(hookStep); }
      container = hookStep;
    } else { hookStep = undefined; hookName = undefined; }
    const chainer = String(c.log.get('chainerId') || '');
    const parent = c.log.get('type') === 'child' ? parents.get(chainer) : undefined;
    const under = parent ?? inGroup ?? container;
    if (under) add(under, step);
    else out.push(step);
    if (!parent && chainer) parents.set(chainer, step);
    if (group) groups.set(String(c.log.get('id') ?? ''), step);
  });
  // Cucumber stops a scenario at the first failing step: the steps after it are listed, greyed out. A step whose
  // definition returned "pending" is greyed out too.
  if (g && t && t.state === 'pending') { const last = [...out].reverse().find(x => x.category === 'test.step'); if (last && !last.error) last.status = 'skipped'; }
  if (g) for (const ps of g.pickle.steps.slice(ran)) out.push({ title: `${keywordOf(g, ps)} ${ps.text}`, category: 'test.step', duration: 0, status: 'skipped', steps: [] });
  return out;
}

function camel(hookName: string): string {
  const m = /^(before|after) (each|all)$/i.exec(hookName.replace(/"/g, '').replace(/ hook.*$/i, '').trim());
  return m ? m[1].toLowerCase() + (m[2].toLowerCase() === 'each' ? 'Each' : 'All') : hookName;
}

function routeTitle(log: CyLog): string {
  const p = props(log);
  return `intercept ${p.Method ?? ''} ${p.URL ?? p.Matcher ?? ''}${p.Alias ? ' as @' + p.Alias : ''}`;
}

/** The text Cypress shows on the command line, e.g. "POST 200 /api/users" for cy.request. */
function display(log: CyLog): string {
  try { const rp = log.get('renderProps'); const v = typeof rp === 'function' ? rp() : rp; return String(v?.message ?? ''); } catch { return ''; }
}

function toMs(v: unknown): number {
  if (!v) return 0;
  const n = v instanceof Date ? v.getTime() : new Date(v as string).getTime();
  return Number.isFinite(n) ? n : 0;
}

function props(log: CyLog): any {
  try {
    const cp = typeof log.invoke === 'function' ? log.invoke('consoleProps') : log.get('consoleProps');
    const v = typeof cp === 'function' ? cp() : cp;
    return (v && (v.props ?? v)) || {};
  } catch { return {}; }
}

/** cy.request (with request and response) and the app's fetch / XHR calls. */
function api(): Api[] {
  const out: Api[] = [];
  for (const c of logs) {
    const name = c.log.get('name');
    if (name !== 'request' && name !== 'xhr' && name !== 'fetch') continue;
    const p = props(c.log);
    if (c.log.get('event') || name !== 'request') {
      // the app's own fetch / XHR: method, URL, status once answered; headers and body when Cypress kept them
      const shown = display(c.log);   // "GET 200 /api/users" once answered
      const status = Number(p['Response Status Code'] ?? p.Status ?? (shown.match(/^\w+\s+(\d{3})\b/) || [])[1]) || undefined;
      if (p.URL) out.push({ method: String(p.Method || shown.split(' ')[0] || 'GET').toUpperCase(), url: String(p.URL), status,
        requestHeaders: p['Request Headers'], requestBody: parse(p['Request Body']), responseHeaders: p['Response Headers'], responseBody: parse(p['Response Body']) });
      continue;
    }
    const reqs = Array.isArray(p.Requests) ? p.Requests : p.Request ? [p.Request] : [];
    const yielded = p.Yielded || {};
    for (const r of reqs.length ? reqs : [{}]) {
      const url = r['Request URL'] ?? yielded.url ?? p.URL;
      if (!url) continue;
      out.push({
        method: String(r['Request Method'] ?? display(c.log).split(' ')[0] ?? 'GET').toUpperCase() || 'GET',
        url: String(url),
        status: Number(r['Response Status'] ?? yielded.status) || undefined,
        duration: typeof yielded.duration === 'number' ? yielded.duration : undefined,
        requestHeaders: r['Request Headers'], requestBody: parse(r['Request Body']),
        responseHeaders: r['Response Headers'], responseBody: parse(r['Response Body'] ?? yielded.body),
      });
    }
  }
  return out;
}

function parse(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

// ── @badeball/cypress-cucumber-preprocessor ─────────────────────────────────────────────────────────────────────────
// It puts the running scenario on window.testState: the parsed feature file, the pickle (the scenario with its steps
// and tags, an Outline row filled in) and the step running now. Read only; nothing here changes what it does.

interface Scenario { doc: any; pickle: any; step?: any; ast: Map<string, any> }
const astCache = new WeakMap<object, Map<string, any>>();

/** The scenario this test runs, or undefined (not a feature file, or the state belongs to another test). */
function scenario(t: any): Scenario | undefined {
  try {
    const ts = (globalThis as any).testState;
    const pickle = ts && ts.pickle;
    if (!pickle || !ts.gherkinDocument || !Array.isArray(pickle.steps)) return undefined;
    const title = String((t && t.title) || '');
    const name = String(pickle.name || '');
    if (title && name && title !== name && !title.startsWith(name + ' (example #')) return undefined;
    let ast = astCache.get(ts.gherkinDocument);
    if (!ast) { ast = index(ts.gherkinDocument); astCache.set(ts.gherkinDocument, ast); }
    return { doc: ts.gherkinDocument, pickle, step: ts.pickleStep, ast };
  } catch { return undefined; }
}

/** Every Background / Scenario step, Scenario and Examples row of the feature by its id. */
function index(doc: any): Map<string, any> {
  const m = new Map<string, any>();
  const visit = (children: any[], rule?: any) => {
    for (const ch of children || []) {
      const bg = ch.background;
      if (bg) for (const st of bg.steps || []) m.set(st.id, { step: st });
      const sc = ch.scenario;
      if (sc) {
        m.set(sc.id, { scenario: sc, rule });
        for (const st of sc.steps || []) m.set(st.id, { step: st });
        for (const ex of sc.examples || []) for (const row of ex.tableBody || []) m.set(row.id, { row, examples: ex });
      }
      if (ch.rule) visit(ch.rule.children, ch.rule);
    }
  };
  visit(doc.feature && doc.feature.children);
  return m;
}

function keywordOf(g: Scenario, ps: any): string {
  const node = g.ast.get(ps && ps.astNodeIds && ps.astNodeIds[0]);
  return String((node && node.step && node.step.keyword) || '').trim() || '*';
}

function lineOf(g: Scenario, ps: any): number | undefined {
  const node = g.ast.get(ps && ps.astNodeIds && ps.astNodeIds[0]);
  return node && node.step && node.step.location ? node.step.location.line : undefined;
}

/** What the report needs about the scenario: where it is, its tags, its example row, data tables and doc strings. */
function gherkin(t: any): any {
  const g = scenario(t);
  if (!g) return undefined;
  const ids: string[] = g.pickle.astNodeIds || [];
  const sc = g.ast.get(ids[0]) || {};
  const row = ids.length > 1 ? g.ast.get(ids[ids.length - 1]) : undefined;
  const f = g.doc.feature || {};
  const out: any = {
    feature: f.name, rule: sc.rule && sc.rule.name,
    keyword: sc.scenario && sc.scenario.keyword,
    line: (row && row.row && row.row.location && row.row.location.line) || (sc.scenario && sc.scenario.location && sc.scenario.location.line),
    tags: (g.pickle.tags || []).map((x: any) => String(x.name)),
  };
  if (row && row.row && row.examples) {
    out.example = { header: (row.examples.tableHeader && row.examples.tableHeader.cells || []).map((c: any) => String(c.value)), values: (row.row.cells || []).map((c: any) => String(c.value)) };
  }
  const args: any[] = [];
  for (const ps of g.pickle.steps) {
    const a = ps.argument;
    if (!a) continue;
    const step = `${keywordOf(g, ps)} ${ps.text}`;
    if (a.dataTable) args.push({ step, table: (a.dataTable.rows || []).map((r: any) => (r.cells || []).map((c: any) => String(c.value))) });
    else if (a.docString) args.push({ step, docString: String(a.docString.content ?? '') });
  }
  if (args.length) out.args = args;
  // the step that was running when the test stopped: failed, or returned "pending"
  if (g.step && (t.state === 'failed' || t.state === 'pending')) out.stoppedAt = { step: `${keywordOf(g, g.step)} ${g.step.text}`, line: lineOf(g, g.step), state: t.state };
  return out;
}
