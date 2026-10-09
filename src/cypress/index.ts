/**
 * reportingLabs for Cypress.
 *
 *   // cypress.config.js
 *   const { defineConfig } = require('cypress');
 *   const { reportingLabs } = require('reporting-labs/cypress');
 *
 *   module.exports = defineConfig({
 *     e2e: {
 *       setupNodeEvents(on, config) {
 *         reportingLabs(on, config, { title: 'Checkout regression' });
 *         return config;
 *       },
 *     },
 *   });
 *
 * `cypress run` then writes reporting-labs/index.html, report.json and report.pdf: the same report the Playwright
 * reporter makes. It is built from what Cypress hands the Node process after every spec (`after:spec`): each test's
 * title path, state, retries, duration and error, the screenshots and the spec video. Line numbers and comment meta
 * come from the spec file itself. Cypress allows one handler per event, so if your config already listens to
 * before:run / after:spec / after:run, call the handlers this returns from your own (see README).
 *
 * Nothing here touches the Playwright or WebdriverIO reporters; it only reuses the shared helpers.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { writeReport, type WriteReportOptions } from '../write-report';
import { makeMasker } from '../mask';
import { explainError } from '../explain';
import { commentMetaAt, lineOfTitle } from '../comments';
import { metaFromTags, META_KEYS } from '../wdio/reporter';
import { detectEnvName } from '../reporter';
import type { TestData, ResultData, ErrorData, AttachmentData, Status } from '../types';

export interface ReportingLabsCypressOptions extends WriteReportOptions {
  /** Read meta from a comment right above it() / describe(): `/** @owner naveen @priority P0 *\/`. Default: true */
  commentMeta?: boolean;
  /** Screenshots inside the HTML as data URIs (default true); bigger than embedLimit or false: copied to assets/. */
  embedAttachments?: boolean;
  /** Bytes; attachments above it are copied to assets/ instead of embedded. Default 2 MB. */
  embedLimit?: number;
  /** Put the spec video inside the HTML too (default false: copied to assets/). */
  embedVideos?: boolean;
  /** Which tests get the spec's video (Cypress records one video per spec): 'failed' (failed and flaky, default) or 'all'. */
  video?: 'failed' | 'all';
  /** Variable that holds the environment name, when it is not ENV, TEST_ENV, APP_ENV or *_ENV. */
  envVar?: string;
}

// Minimal shapes of what Cypress passes (no dependency on the cypress package at runtime or for types).
interface CyBrowser { name?: string; displayName?: string; version?: string; majorVersion?: string | number }
interface CyBeforeRun { browser?: CyBrowser; cypressVersion?: string; config?: Record<string, unknown> }
interface CySpec { name?: string; relative?: string; absolute?: string }
interface CyTest { title?: string[]; state?: string; duration?: number; displayError?: string | null; attempts?: { state?: string }[] }
interface CyScreenshot { name?: string; path?: string; takenAt?: string }
interface CyRunResult {
  error?: string | null;
  stats?: { startedAt?: string; endedAt?: string; duration?: number };
  spec?: CySpec;
  tests?: CyTest[] | null;
  screenshots?: CyScreenshot[];
  video?: string | null;
}
interface CyAfterRun {
  status?: string;
  browserName?: string; browserVersion?: string; cypressVersion?: string;
  startedTestsAt?: string; endedTestsAt?: string; totalFailed?: number;
}
type On = (event: string, handler: (...args: any[]) => unknown) => void;

const DEFAULT_EMBED_LIMIT = 2 * 1024 * 1024;

export interface ReportingLabsCypressHandlers {
  beforeRun: (details: CyBeforeRun) => void;
  afterSpec: (spec: CySpec, results: CyRunResult) => void;
  afterRun: (results: CyAfterRun) => Promise<string | undefined>;
}

export function reportingLabs(on: On, config: Record<string, unknown> = {}, options: ReportingLabsCypressOptions = {}): ReportingLabsCypressHandlers {
  const opts = withRuntimeOverrides(options);
  const collector = new CypressCollector(opts, config);
  const handlers: ReportingLabsCypressHandlers = {
    beforeRun: d => safe(() => collector.beforeRun(d)),
    afterSpec: (spec, results) => safe(() => collector.afterSpec(spec, results)),
    afterRun: async results => { try { return await collector.afterRun(results); } catch (e) { console.warn('reporting-labs: report not written:', (e as Error)?.message ?? e); return undefined; } },
  };
  if (typeof on === 'function') {
    on('before:run', handlers.beforeRun);
    on('after:spec', handlers.afterSpec);
    on('after:run', handlers.afterRun);
  }
  return handlers;
}
export default reportingLabs;

function safe(fn: () => void): void { try { fn(); } catch (e) { console.warn('reporting-labs:', (e as Error)?.message ?? e); } }

/** REPORTING_LABS_* variables beat the options, the same contract as the Playwright, Java and Python reporters. */
function withRuntimeOverrides(options: ReportingLabsCypressOptions): ReportingLabsCypressOptions {
  const metadata = { ...(options.metadata ?? {}) };
  for (const [k, v] of Object.entries(process.env)) {
    const m = /^REPORTING_LABS_METADATA_([A-Z0-9_]+)$/.exec(k);
    if (m && v && v.trim()) metadata[m[1].toLowerCase()] = v.trim();
  }
  if (!process.env.REPORTING_LABS_METADATA_ENV) { const detected = detectEnvName(process.env, options.envVar); if (detected) metadata.env = detected; }
  const scalar = (name: string, current: string | undefined) => { const v = process.env['REPORTING_LABS_' + name]; return v && v.trim() ? v.trim() : current; };
  return { ...options, metadata,
    title: scalar('TITLE', options.title), theme: scalar('THEME', options.theme) as ReportingLabsCypressOptions['theme'],
    palette: scalar('PALETTE', options.palette) as ReportingLabsCypressOptions['palette'], accent: scalar('ACCENT', options.accent),
    logo: scalar('LOGO', options.logo), outputFolder: scalar('OUTPUT_FOLDER', options.outputFolder) };
}

export class CypressCollector {
  private masker: ReturnType<typeof makeMasker>;
  private tests: TestData[] = [];
  private startTime = 0;
  private endTime = 0;
  private browser = '';
  private cypressVersion = '';
  private outDir: string;
  private assetsDir: string;
  private assetCounter = 0;
  private assetsReady = false;
  private base: string;

  constructor(private options: ReportingLabsCypressOptions, private config: Record<string, unknown> = {}) {
    this.masker = makeMasker(options.maskKeys ?? [], { knownValues: options.maskValues ?? [], fromEnv: options.maskFromEnv !== false });
    this.base = typeof config.projectRoot === 'string' && config.projectRoot ? config.projectRoot : process.cwd();
    this.outDir = path.resolve(this.base, options.outputFolder || 'reporting-labs');
    this.assetsDir = path.join(this.outDir, 'assets');
  }

  beforeRun(d: CyBeforeRun = {}): void {
    this.startTime = Date.now();
    this.browser = browserLabel(d.browser);
    this.cypressVersion = d.cypressVersion || '';
    this.prepareAssets();
  }

  /** assets/ holds this run's copied files only: emptied once per run, before the first file lands. */
  private prepareAssets(): void {
    if (this.assetsReady) return;
    this.assetsReady = true;
    try { fs.rmSync(this.assetsDir, { recursive: true, force: true }); } catch { /* fine */ }
  }

  afterSpec(spec: CySpec = {}, results: CyRunResult = {}): void {
    this.prepareAssets();
    const s = results.spec ?? spec ?? {};
    const abs = s.absolute || spec.absolute || '';
    const file = this.rel(abs || s.relative || spec.relative || s.name || '');
    const startedAt = Date.parse(results.stats?.startedAt ?? '') || Date.now();
    const endedAt = Date.parse(results.stats?.endedAt ?? '') || startedAt + (results.stats?.duration ?? 0);
    if (!this.startTime || startedAt < this.startTime) this.startTime = startedAt;
    if (endedAt > this.endTime) this.endTime = endedAt;

    const cyTests = results.tests ?? [];
    const out: TestData[] = [];
    let cursor = startedAt;
    for (const ct of cyTests) {
      const t = this.toTest(ct, abs, file, cursor);
      cursor += t.duration;
      out.push(t);
    }
    // The spec could not run at all (syntax error, failed import, uncaught error before the first test)
    if (!out.length && results.error) {
      const t = this.toTest({ title: [s.name || path.basename(file) || 'spec'], state: 'failed', duration: 0, displayError: results.error, attempts: [{ state: 'failed' }] }, abs, file, startedAt);
      t.note = 'The spec failed before any test ran.';
      out.push(t);
    }
    this.attachScreenshots(out, cyTests, results.screenshots ?? [], startedAt);
    this.attachVideo(out, results.video, file);
    this.tests.push(...out);
  }

  async afterRun(results: CyAfterRun = {}): Promise<string | undefined> {
    if (!this.tests.length) return undefined;
    const project = this.browser || results.browserName || '';
    for (const t of this.tests) {
      t.project = project;
      t.key = `${project}::${t.file}::${[...t.path, t.title].join(' › ')}`;
    }
    const start = Date.parse(results.startedTestsAt ?? '') || this.startTime || Date.now();
    const end = Date.parse(results.endedTestsAt ?? '') || this.endTime || Date.now();
    const failed = this.tests.some(t => t.outcome === 'failed' || t.outcome === 'timedOut');
    const version = this.cypressVersion || results.cypressVersion || '';
    const bver = results.browserVersion ? ` ${results.browserVersion}` : '';
    const envRows = version ? [{ k: 'Cypress', v: version + (project ? ` · ${project}${bver}` : '') }] : [];
    return writeReport(this.tests, { startTime: start, endTime: Math.max(end, start), runStatus: failed ? 'failed' : 'passed', workers: 1, envRows },
      { ...this.options, outputFolder: this.outDir, logo: this.resolveLogo(this.options.logo), bdd: this.options.bdd });
  }

  /** One Cypress test → one report row. Cypress gives the attempts' states but one duration and one error (the last). */
  toTest(ct: CyTest, abs: string, file: string, startTime: number): TestData {
    const titles = (ct.title ?? []).map(x => String(x));
    const title = titles[titles.length - 1] ?? '';
    const suites = titles.slice(0, -1);
    const attempts = ct.attempts && ct.attempts.length ? ct.attempts : [{ state: ct.state }];
    const total = Math.max(0, Math.round(ct.duration ?? 0));
    const each = attempts.length > 1 ? Math.round(total / attempts.length) : total;

    // Line numbers and comment meta from the spec file: each describe is looked up after the one around it
    const at: number[] = [];
    let from = 0;
    for (const st of suites) { const ln = abs ? lineOfTitle(abs, st, 'describe|context|suite', from) : 0; if (ln) { at.push(ln); from = ln; } }
    const line = abs ? lineOfTitle(abs, title, 'it|test|specify', from) : 0;
    const tags: string[] = [...titles.join(' ').matchAll(/@[A-Za-z][\w:.=-]*/g)].map(m => m[0]);
    const fromComments: Record<string, string> = {};
    if (abs && this.options.commentMeta !== false) {
      try {
        for (const ln of [...at, line].filter(Boolean)) {
          const c = commentMetaAt(abs, ln);
          Object.assign(fromComments, c.meta);
          for (const g of c.tags) if (!tags.includes(g) && !META_KEYS.includes(g.slice(1).toLowerCase())) tags.push(g);
        }
      } catch { /* comments are a convenience: never fail the run over them */ }
    }
    const { meta, clean } = metaFromTags(tags, META_KEYS);
    for (const [k, v] of Object.entries(fromComments)) meta[k] = this.masker.maskStr(v);

    const results: ResultData[] = attempts.map((a, i) => {
      const status = cyStatus(a.state);
      const last = i === attempts.length - 1;
      const r: ResultData = {
        retry: i, status, duration: last ? total - each * (attempts.length - 1) : each, startTime: startTime + each * i, workerIndex: 0,
        errors: [], steps: [], attachments: [], stdout: [], stderr: [], logs: [], data: [], api: [],
      };
      if (status === 'failed' && last && ct.displayError) r.errors.push(this.toError(ct.displayError, abs));
      return r;
    });
    const finalState = cyStatus(ct.state ?? attempts[attempts.length - 1].state);
    let outcome: Status = finalState === 'passed' ? 'passed' : finalState === 'skipped' ? 'skipped' : 'failed';
    if (outcome === 'passed' && results.some(r => r.status === 'failed')) outcome = 'flaky';
    // a failing final state whose last attempt Cypress reports otherwise: keep the error on the last result
    if (outcome === 'failed' && ct.displayError && !results[results.length - 1].errors.length) results[results.length - 1].errors.push(this.toError(ct.displayError, abs));

    const t: TestData = {
      id: crypto.createHash('sha1').update(file + '\u0000' + titles.join('\u0000')).digest('hex').slice(0, 20),
      key: '', title: this.masker.maskStr(title), path: suites.map(x => this.masker.maskStr(x)),
      file, line, project: '', tags: clean, annotations: [], meta,
      outcome, duration: total, results, retries: attempts.length - 1,
    };
    if (ct.state === 'skipped') t.note = 'Not run: a before / beforeEach hook failed earlier in this spec.';
    const hook = /during a `(before all|before each|after each|after all)` hook/.exec(ct.displayError ?? '');
    if (hook) t.note = `Failed in the ${hook[1]} hook${/before all|after all/.test(hook[1]) ? ', so Cypress skipped the other tests of this describe and did not retry' : ''}.`;
    if (ct.state === 'pending') t.annotations.push({ type: 'skip' });
    return t;
  }

  /** displayError is the message plus a stack ("    at …"); the first frame in the spec file gives the location. */
  toError(display: string, abs: string): ErrorData {
    const clean = stripAnsi(display);
    const idx = clean.search(/\n\s+at /);
    const message = this.masker.maskStr((idx >= 0 ? clean.slice(0, idx) : clean).trim());
    const stack = idx >= 0 ? this.masker.maskStr(clean.slice(idx + 1)) : undefined;
    const d: ErrorData = { message };
    if (stack) d.stack = stack;
    const ex = explainError(message);
    if (ex) d.explain = ex;
    if (abs) {
      const base = path.basename(abs).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`${base}:(\\d+):(\\d+)`).exec(stack ?? clean);
      if (m) {
        const line = Number(m[1]), column = Number(m[2]);
        d.location = { file: this.rel(abs), line, column };
        const snip = codeFrame(abs, line, column);
        if (snip) d.snippet = snip;
      }
    }
    return d;
  }

  /** Cypress names a failure screenshot "<describe> -- <it> (failed) (attempt 2).png"; a custom cy.screenshot('name')
   *  is matched to the test that was running when it was taken. */
  private attachScreenshots(tests: TestData[], cyTests: CyTest[], shots: CyScreenshot[], specStart: number): void {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const byName = new Map<string, number>();
    cyTests.forEach((ct, i) => byName.set(norm((ct.title ?? []).join(' -- ')), i));
    for (const sh of shots) {
      if (!sh.path) continue;
      const base = path.basename(sh.path).replace(/\.\w+$/, '');
      const attemptM = /\(attempt (\d+)\)\s*$/.exec(base);
      const stem = base.replace(/\s*\(attempt \d+\)\s*$/, '').replace(/\s*\(failed\)\s*$/, '');
      let ti = byName.get(norm(stem));
      if (ti === undefined) {
        // custom name: the test whose time window holds takenAt, else the spec's only test
        const at = Date.parse(sh.takenAt ?? '');
        let cursor = specStart;
        tests.forEach((t, i) => { if (ti === undefined && at && at >= cursor && at <= cursor + t.duration + 1000) ti = i; cursor += t.duration; });
        if (ti === undefined && tests.length === 1) ti = 0;
      }
      if (ti === undefined || !tests[ti]) continue;
      const t = tests[ti];
      const ri = attemptM ? Math.min(Number(attemptM[1]) - 1, t.results.length - 1) : (/\(failed\)/.test(base) ? firstFailed(t) : t.results.length - 1);
      const a = this.attachment(sh.path, /\(failed\)/.test(base) ? 'screenshot' : (sh.name || stem), t.title);
      if (a) t.results[Math.max(0, ri)].attachments.push(a);
    }
  }

  private attachVideo(tests: TestData[], video: string | null | undefined, file: string): void {
    if (!video || !fs.existsSync(video)) return;
    const who = this.options.video === 'all' ? tests : tests.filter(t => t.outcome === 'failed' || t.outcome === 'flaky');
    if (!who.length) return;
    const a = this.attachment(video, 'video', path.basename(file) || 'spec', true);
    if (!a) return;
    for (const t of who) t.results[t.results.length - 1].attachments.push({ ...a });
  }

  private attachment(p: string, name: string, owner: string, isVideoFile = false): AttachmentData | null {
    try {
      if (!fs.existsSync(p)) return null;
      const ext = path.extname(p).toLowerCase();
      const contentType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : 'application/octet-stream';
      const size = fs.statSync(p).size;
      const out: AttachmentData = { name, contentType, size };
      const isVideo = isVideoFile || contentType.startsWith('video/');
      const embed = (this.options.embedAttachments ?? true) && (!isVideo || this.options.embedVideos === true);
      if (embed && size <= (this.options.embedLimit ?? DEFAULT_EMBED_LIMIT)) {
        out.src = `data:${contentType};base64,${fs.readFileSync(p).toString('base64')}`;
        return out;
      }
      fs.mkdirSync(this.assetsDir, { recursive: true });
      const fname = `${sanitize(owner)}-${sanitize(name)}-${this.assetCounter++}${ext}`;
      fs.copyFileSync(p, path.join(this.assetsDir, fname));
      out.src = `assets/${fname}`;
      return out;
    } catch { return null; }
  }

  private resolveLogo(logo?: string): string | undefined {
    if (!logo || /^(https?:|data:)/i.test(logo)) return logo;
    const file = path.resolve(this.base, logo);
    const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon' };
    const type = mime[path.extname(file).toLowerCase()];
    if (!fs.existsSync(file) || !type) { console.warn(`reporting-labs: logo ${logo} not found or not an image`); return undefined; }
    return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
  }

  private rel(file: string): string {
    if (!file) return file;
    if (!path.isAbsolute(file)) return file.split(path.sep).join('/');
    try { return path.relative(this.base, file).split(path.sep).join('/'); } catch { return file; }
  }
}

function cyStatus(state?: string): 'passed' | 'failed' | 'skipped' {
  return state === 'passed' ? 'passed' : state === 'failed' ? 'failed' : 'skipped';
}

function firstFailed(t: TestData): number {
  const i = t.results.findIndex(r => r.status === 'failed');
  return i >= 0 ? i : t.results.length - 1;
}

function browserLabel(b?: CyBrowser): string {
  if (!b) return '';
  return String(b.name || b.displayName || '').toLowerCase();
}

function stripAnsi(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function sanitize(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file'; }

/** The lines around `line` with a marker, like Playwright's error snippet. */
function codeFrame(file: string, line: number, column: number): string | undefined {
  let src: string[];
  try { src = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { return undefined; }
  if (line < 1 || line > src.length) return undefined;
  const lo = Math.max(1, line - 2), hi = Math.min(src.length, line + 2);
  const w = String(hi).length;
  const rows: string[] = [];
  for (let n = lo; n <= hi; n++) {
    rows.push(`${n === line ? '>' : ' '} ${String(n).padStart(w)} | ${src[n - 1]}`);
    if (n === line && column > 0) rows.push(`  ${' '.repeat(w)} | ${' '.repeat(column - 1)}^`);
  }
  return rows.join('\n');
}
