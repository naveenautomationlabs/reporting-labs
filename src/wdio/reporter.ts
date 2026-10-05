/**
 * reportingLabs reporter for WebdriverIO.
 *
 * WDIO drives a reporter by emitting lifecycle events onto it and reading `isSynchronised`, so this
 * class is a plain EventEmitter — it needs no `@wdio/reporter` at runtime and stays CommonJS, which
 * loads on every Node version. One instance runs per runner (per spec / worker); it collects that
 * runner's suites, tests, WebDriver-command steps, errors and (on failure) a screenshot, then writes
 * a partial JSON. `reportingLabsComplete()` (a one-line `onComplete` hook) combines every partial into
 * the one report — the same index.html, report.json and report.pdf the Playwright reporter produces.
 *
 * Nothing here touches the Playwright reporter; it only reuses the shared, pure helpers.
 */
import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as path from 'path';
import { makeMasker } from '../mask';
import { explainError } from '../explain';
import type { TestData, ResultData, StepData, ErrorData, Status } from '../types';

const META_KEYS = ['priority', 'severity', 'feature', 'owner', 'epic', 'story', 'issue', 'bug', 'component', 'module', 'team', 'sprint', 'testcase', 'tms', 'requirement'];

/** WebDriver command name → readable step verb. Commands not listed (reads, internals) are not steps. */
const CMD: Record<string, string> = {
  navigateTo: 'open', url: 'open', back: 'back', forward: 'forward', refresh: 'refresh',
  elementClick: 'click', click: 'click', doubleClick: 'double click',
  elementSendKeys: 'set value', setValue: 'set value', addValue: 'add value', elementClear: 'clear', clearValue: 'clear',
  findElement: 'find', findElements: 'find all', findElementFromElement: 'find', findElementsFromElement: 'find all',
  switchToFrame: 'switch to frame', switchToParentFrame: 'switch to parent frame', switchToWindow: 'switch to window',
  acceptAlert: 'accept alert', dismissAlert: 'dismiss alert', sendAlertText: 'type into alert',
  performActions: 'perform actions', executeScript: 'execute script', executeAsyncScript: 'execute async script',
  setWindowRect: 'resize window', maximizeWindow: 'maximize window', minimizeWindow: 'minimize window', fullscreenWindow: 'fullscreen window',
  uploadFile: 'upload file', addCookie: 'add cookie', deleteCookie: 'delete cookie', deleteAllCookies: 'delete all cookies',
};

type Mask = ReturnType<typeof makeMasker>;

// Minimal shapes of the raw WDIO event payloads (so no @wdio/reporter dependency is needed).
interface RunnerPayload { cid?: string; capabilities?: Record<string, unknown>; specs?: string[] }
interface SuitePayload { title?: string; type?: string }
interface TestPayload { uid?: string; title?: string; file?: string; duration?: number; retries?: number; error?: Error; errors?: Error[]; pendingReason?: string; pending?: boolean }
interface CommandPayload { command?: string; method?: string; endpoint?: string; body?: unknown }

export interface ReportingLabsWdioOptions {
  outputFolder?: string;
  title?: string;
  screenshot?: 'on-failure' | 'always' | 'off';
  maskKeys?: string[];
  maskValues?: string[];
  maskFromEnv?: boolean;
  [k: string]: unknown;
}

export default class ReportingLabsWdioReporter extends EventEmitter {
  // props WDIO's BaseReporter reads/sets on a reporter
  public options: ReportingLabsWdioOptions;
  public outputStream = { write: (_c: unknown): boolean => true };

  private masker: Mask;
  private startTime = Date.now();
  private suiteStack: string[] = [];
  private rlTests: TestData[] = [];
  private specs: string[] = [];
  private cur?: { test: TestData; result: ResultData; stepStack: StepData[] };
  private cid = '';
  private capsName = '';
  private runStatus: 'passed' | 'failed' = 'passed';
  private pending = 0;
  private endInfo?: { endTime: number };
  private written = false;

  constructor(options: ReportingLabsWdioOptions = {}) {
    super();
    this.setMaxListeners(0);
    this.options = options || {};
    this.masker = makeMasker(this.options.maskKeys || [], { knownValues: this.options.maskValues || [], fromEnv: this.options.maskFromEnv !== false });
    this.on('runner:start', (r: RunnerPayload) => this.safe(() => this.onRunnerStart(r)));
    this.on('suite:start', (s: SuitePayload) => this.safe(() => this.onSuiteStart(s)));
    this.on('suite:end', () => this.safe(() => this.onSuiteEnd()));
    this.on('test:start', (t: TestPayload) => this.safe(() => this.onTestStart(t)));
    this.on('test:pass', (t: TestPayload) => this.safe(() => this.endTest(t, 'passed')));
    this.on('test:fail', (t: TestPayload) => this.safe(() => { this.runStatus = 'failed'; this.endTest(t, 'failed'); }));
    this.on('test:skip', (t: TestPayload) => this.safe(() => this.endTest(t, 'skipped', t.pendingReason)));
    this.on('test:pending', (t: TestPayload) => this.safe(() => this.endTest(t, 'skipped', t.pendingReason)));
    this.on('client:beforeCommand', (c: CommandPayload) => this.safe(() => this.onBeforeCommand(c)));
    this.on('client:afterCommand', () => this.safe(() => this.onAfterCommand()));
    this.on('runner:end', () => this.safe(() => this.onRunnerEnd()));
  }

  /** WDIO polls this before tearing a worker down; we hold it open until the partial is written. */
  get isSynchronised(): boolean {
    return this.written || (this.pending === 0 && !this.endInfo);
  }

  write(_content: unknown): void { /* we manage our own files */ }

  private safe(fn: () => void): void { try { fn(); } catch { /* a reporter bug must never fail the run */ } }

  private onRunnerStart(runner: RunnerPayload): void {
    this.startTime = Date.now();
    this.cid = runner.cid || '';
    this.specs = runner.specs || [];
    this.capsName = capsName(runner.capabilities);
  }

  private onSuiteStart(suite: SuitePayload): void {
    if (suite.title) this.suiteStack.push(suite.title);
  }

  private onSuiteEnd(): void { this.suiteStack.pop(); }

  private onTestStart(test: TestPayload): void {
    const now = Date.now();
    const result: ResultData = {
      retry: test.retries || 0, status: 'passed', duration: 0, startTime: now, workerIndex: numericCid(this.cid),
      errors: [], steps: [], attachments: [], stdout: [], stderr: [], logs: [], data: [], api: [],
    };
    const file = this.rel(test.file || this.specs[0] || '');
    const tagSource = [test.title || '', ...this.suiteStack].join(' ');
    const tags = (tagSource.match(/@[A-Za-z][\w:.=-]*/g) || []);
    const { meta } = metaFromTags(tags, META_KEYS);
    const t: TestData = {
      id: test.uid || `${file}:${test.title}`,
      key: '', title: this.masker.maskStr(test.title || ''), path: this.suiteStack.map(s => this.masker.maskStr(s)),
      file, line: 0, project: this.capsName, tags, annotations: [], meta,
      outcome: 'passed', duration: 0, results: [result], retries: test.retries,
    };
    t.key = `${t.project}::${t.file}::${[...t.path, t.title].join(' › ')}`;
    this.cur = { test: t, result, stepStack: [] };
  }

  private onBeforeCommand(cmd: CommandPayload): void {
    if (!this.cur) return;
    const title = cmdTitle(cmd, this.masker);
    if (!title) return;
    const step: StepData & { _start?: number } = { title, category: 'wdio', duration: 0, steps: [] };
    step._start = Date.now();
    const parent = this.cur.stepStack[this.cur.stepStack.length - 1];
    (parent ? parent.steps : this.cur.result.steps).push(step);
    this.cur.stepStack.push(step);
  }

  private onAfterCommand(): void {
    if (!this.cur) return;
    const step = this.cur.stepStack.pop() as (StepData & { _start?: number }) | undefined;
    if (step) { step.duration = Date.now() - (step._start || Date.now()); delete step._start; }
  }

  private endTest(test: TestPayload, status: 'passed' | 'failed' | 'skipped', skipReason?: string): void {
    if (!this.cur) this.onTestStart(test);   // a skipped / pending test may never fire test:start
    if (!this.cur) return;
    const { test: t, result } = this.cur;
    this.cur.stepStack.length = 0;
    result.status = status;
    result.duration = test.duration ?? (Date.now() - result.startTime);
    let outcome: Status = status;
    if (status === 'passed' && (test.retries || 0) > 0) outcome = 'flaky';
    t.outcome = outcome;
    t.duration = result.duration;
    if (skipReason) { t.note = skipReason; t.annotations.push({ type: 'skip', description: skipReason }); }
    if (status === 'failed') {
      const errs = (test.errors && test.errors.length ? test.errors : (test.error ? [test.error] : [])) as Error[];
      for (const e of errs) result.errors.push(this.toError(e));
      this.maybeShot(result);
    }
    this.rlTests.push(t);
    this.cur = undefined;
  }

  /** Best-effort screenshot of the live session on failure. Async — gated by isSynchronised so the
   *  partial is written only once it resolves. */
  private maybeShot(result: ResultData): void {
    if (this.options.screenshot === 'off') return;
    const b = (global as unknown as { browser?: { takeScreenshot?: () => Promise<string> } }).browser;
    if (!b || typeof b.takeScreenshot !== 'function') return;
    this.pending++;
    Promise.resolve()
      .then(() => b.takeScreenshot!())
      .then((b64) => { if (b64) result.attachments.push({ name: 'screenshot', contentType: 'image/png', src: 'data:image/png;base64,' + b64 }); })
      .catch(() => { /* session may be gone; skip */ })
      .finally(() => { this.pending--; this.tryWrite(); });
  }

  private toError(e: Error): ErrorData {
    const message = this.masker.maskStr(stripAnsi(String(e?.message ?? e ?? '')));
    const stack = e?.stack ? this.masker.maskStr(stripAnsi(String(e.stack))) : undefined;
    const d: ErrorData = { message };
    const ex = explainError(message);
    if (ex) d.explain = ex;
    if (stack && stack !== message) d.stack = stack;
    return d;
  }

  private onRunnerEnd(): void {
    this.endInfo = { endTime: Date.now() };
    this.tryWrite();
  }

  private tryWrite(): void {
    if (!this.endInfo || this.pending > 0 || this.written) return;
    this.written = true;
    try {
      const dir = path.join(this.options.outputFolder || 'reporting-labs', '.rl-wdio');
      fs.mkdirSync(dir, { recursive: true });
      const part = { startTime: this.startTime, endTime: this.endInfo.endTime, runStatus: this.runStatus, tests: this.rlTests };
      const name = `${(this.cid || 'runner').replace(/[^a-z0-9_-]/gi, '_')}-${process.pid}.json`;
      fs.writeFileSync(path.join(dir, name), JSON.stringify(part));
    } catch { /* best-effort; finalize will simply see fewer parts */ }
  }

  private rel(file: string): string {
    if (!file) return file;
    try { return path.relative(process.cwd(), file).split(path.sep).join('/'); } catch { return file; }
  }
}

function numericCid(cid: string): number {
  const m = /^(\d+)/.exec(cid || '');
  return m ? parseInt(m[1], 10) : 0;
}

function capsName(caps?: Record<string, unknown>): string {
  if (!caps) return '';
  const name = (caps.browserName || caps['appium:deviceName'] || caps.platformName || '') as string;
  const ver = (caps.browserVersion || caps.version || '') as string;
  return [name, ver].filter(Boolean).join(' ').trim();
}

function stripAnsi(s: string): string { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function cmdTitle(cmd: CommandPayload, masker: Mask): string | null {
  const name = cmd.command || endpointCommand(cmd.endpoint);
  if (!name) return null;
  const verb = CMD[name];
  if (!verb) return null;
  const body = (cmd.body || {}) as Record<string, unknown>;
  if (name === 'navigateTo' || name === 'url') return `open ${short(String(body.url ?? ''))}`;
  if (name === 'findElement' || name === 'findElements' || name === 'findElementFromElement' || name === 'findElementsFromElement') {
    return `${verb} ${String(body.using ?? '')}: ${short(String(body.value ?? ''))}`.trim();
  }
  if (name === 'elementSendKeys' || name === 'setValue' || name === 'addValue') {
    let text = Array.isArray(body.text) ? (body.text as unknown[]).join('') : String(body.text ?? body.value ?? '');
    text = masker.maskStr(text);
    return `${verb} "${short(text)}"`;
  }
  if (name === 'executeScript' || name === 'executeAsyncScript') {
    return `${verb} ${short(String(body.script ?? '').replace(/\s+/g, ' '))}`;
  }
  if (name === 'sendAlertText') return 'type into alert';
  return verb;
}

function endpointCommand(endpoint?: string): string | null {
  if (!endpoint) return null;
  if (/\/url$/.test(endpoint)) return 'navigateTo';
  if (/\/click$/.test(endpoint)) return 'elementClick';
  if (/\/value$/.test(endpoint)) return 'elementSendKeys';
  if (/\/clear$/.test(endpoint)) return 'elementClear';
  if (/\/elements$/.test(endpoint)) return 'findElements';
  if (/\/element$/.test(endpoint)) return 'findElement';
  return null;
}

function short(s: string, max = 80): string { return s.length <= max ? s : s.slice(0, max - 1) + '…'; }

/** Pull meta (priority/severity/owner/...) from WDIO tags like `@priority:P1`, `@P1`, `@critical`. */
export function metaFromTags(tags: string[], dims: string[]): { meta: Record<string, string>; clean: string[] } {
  const meta: Record<string, string> = {};
  const clean: string[] = [];
  for (const raw of tags) {
    const tag = String(raw).replace(/^@/, '');
    const m = /^([a-z_-]+)[:=](.+)$/i.exec(tag);
    if (m && dims.includes(m[1].toLowerCase())) { meta[m[1].toLowerCase()] = m[2]; continue; }
    if (/^P[0-4]$/i.test(tag) && dims.includes('priority') && !meta.priority) { meta.priority = tag.toUpperCase(); continue; }
    if (/^(blocker|critical|major|minor|trivial)$/i.test(tag) && dims.includes('severity') && !meta.severity) { meta.severity = tag.toLowerCase(); continue; }
    clean.push(raw);
  }
  return { meta, clean };
}

export { META_KEYS };
