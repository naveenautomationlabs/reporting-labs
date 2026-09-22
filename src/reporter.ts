import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep, TestError,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn } from 'child_process';
import { ReportingLabsOptions, ReportData, TestData, ResultData, StepData, AttachmentData, Status, EnvRow, ErrorData } from './types';
import { renderHtml } from './template';
import { makeMasker, parseCsv } from './mask';
import { explainError } from './explain';
import type { HistoryEntry } from './types';

const DEFAULT_EMBED_LIMIT = 2 * 1024 * 1024;

/** Attach steps created by log() and the automatic API capture; the data shows in its own section, so hide the step. */
function isInternalAttach(s: TestStep): boolean {
  return s.category === 'test.attach' && /^Attach "(rl:log|(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) )/.test(s.title);
}

/** Meta keys shown on every test and turned into links, without being breakdown dimensions. */
const META_KEYS = ['priority', 'severity', 'feature', 'owner', 'epic', 'story', 'issue', 'bug', 'component', 'module', 'team', 'sprint', 'testcase', 'tms', 'requirement'];

export default class ReportingLabsReporter implements Reporter {
  private options: ReportingLabsOptions;
  private config!: FullConfig;
  private suite!: Suite;
  private startTime = Date.now();
  private outDir = '';
  private assetsDir = '';
  private assetCounter = 0;
  private masker = makeMasker();
  private globalErrors: ErrorData[] = [];
  private globalOutput: { stream: 'out' | 'err'; text: string }[] = [];

  constructor(options: ReportingLabsOptions = {}) {
    this.options = options;
    this.masker = makeMasker(options.maskKeys ?? []);
  }

  printsToStdio() { return false; }

  /** Errors outside tests: a spec that throws at load, global setup, a crashed worker. */
  onError(error: TestError) { this.globalErrors.push(this.serializeError(error)); }
  onStdOut(chunk: string | Buffer, test?: TestCase | void) { if (!test) this.pushOutput('out', chunk); }
  onStdErr(chunk: string | Buffer, test?: TestCase | void) { if (!test) this.pushOutput('err', chunk); }
  private pushOutput(stream: 'out' | 'err', chunk: string | Buffer) {
    if (this.globalOutput.length >= 200) return;
    const text = stripAnsi(chunk.toString()).slice(0, 2000);
    if (text.trim()) this.globalOutput.push({ stream, text });
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.suite = suite;
    this.startTime = Date.now();
    const base = config.configFile ? path.dirname(config.configFile) : process.cwd();
    this.outDir = path.resolve(base, this.options.outputFolder ?? 'reporting-labs');
    this.assetsDir = path.join(this.outDir, 'assets');
    // The previous report (and its assets) stays intact while the run is in progress;
    // the folder is refreshed in onEnd, right before the new report is written.
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  async onEnd(result: FullResult) {
    await this.settleAttachmentFiles();
    fs.rmSync(this.assetsDir, { recursive: true, force: true });
    fs.mkdirSync(this.assetsDir, { recursive: true });
    this.assetCounter = 0;
    const tests: TestData[] = [];
    const projects = new Set<string>();
    let workers = 0;

    for (const test of this.suite.allTests()) {
      const project = test.parent.project()?.name ?? '';
      projects.add(project);
      const results = test.results.map(r => {
        workers = Math.max(workers, r.parallelIndex + 1);
        return this.serializeResult(r, test);
      });
      const { outcome, expectedFailure, note } = this.outcome(test);
      const titlePath = this.titlePath(test);
      const file = this.rel(test.location.file);
      const last = test.results[test.results.length - 1];
      const resultAnn = ((last as any)?.annotations ?? []) as { type: string; description?: string }[];
      const annotations = [...test.annotations, ...resultAnn.filter(a => !test.annotations.some(b => b.type === a.type && b.description === a.description))];
      tests.push({
        id: test.id,
        key: `${project}::${file}::${[...titlePath, test.title].join(' › ')}${test.repeatEachIndex ? ' #' + (test.repeatEachIndex + 1) : ''}`,
        title: test.title,
        path: titlePath,
        file,
        line: test.location.line,
        column: test.location.column,
        project,
        tags: test.tags,
        annotations,
        meta: this.extractMeta(test),
        outcome,
        expectedFailure,
        note,
        expectedStatus: test.expectedStatus,
        timeout: test.timeout,
        retries: test.retries,
        duration: results.reduce((a, r) => a + r.duration, 0),
        results,
      });
    }

    const stats = { passed: 0, failed: 0, skipped: 0, flaky: 0, timedOut: 0, interrupted: 0, total: tests.length } as ReportData['stats'];
    for (const t of tests) stats[t.outcome]++;

    const base = this.config.configFile ? path.dirname(this.config.configFile) : process.cwd();
    const histOn = this.options.history?.enabled ?? true;
    const { file: histFile, entries } = histOn ? this.loadHistory(base) : { file: '', entries: [] as HistoryEntry[] };
    const failedCount = stats.failed + stats.timedOut + stats.interrupted;
    const code = (o: Status) => o === 'passed' ? 'p' : o === 'flaky' ? 'k' : o === 'skipped' ? 's' : 'f';
    const perTest: Record<string, [string, number]> = {};
    for (const t of tests) { const last = t.results[t.results.length - 1]; perTest[t.key] = [code(t.outcome), Math.round(last?.duration ?? t.duration)]; }
    const current: HistoryEntry = { time: this.startTime, duration: result.duration ?? Date.now() - this.startTime, passed: stats.passed, failed: failedCount, flaky: stats.flaky, skipped: stats.skipped, total: stats.total, label: this.options.metadata?.build ?? ciRunLabel(process.env) ?? this.options.metadata?.branch, tests: perTest };
    const history = [...entries, current].slice(-(this.options.history?.keep ?? 30));
    if (histOn) { try { fs.writeFileSync(histFile, JSON.stringify(history, null, 1)); } catch { /* read-only fs */ } }
    const bdd = this.options.bdd ?? tests.some(t => t.results.some(r => r.steps.some(st => /^(Given|When|Then|And|But)\b/.test(st.title))));

    const data: ReportData = {
      title: this.options.title ?? 'Test report',
      generatedAt: Date.now(),
      startTime: this.startTime,
      duration: result.duration ?? Date.now() - this.startTime,
      metadata: this.options.metadata ?? {},
      projects: [...projects],
      workers,
      stats,
      tests,
      history,
      bdd,
      rootDir: base,
      env: this.collectEnv(base),
      runStatus: result.status,
      globalErrors: this.globalErrors,
      globalOutput: this.globalOutput,
      shard: this.config.shard ? { current: this.config.shard.current, total: this.config.shard.total } : undefined,
      options: {
        logo: this.resolveLogo(this.options.logo),
        accent: this.options.accent,
        theme: this.options.theme ?? 'auto',
        palette: this.options.palette ?? 'lab',
        embedFonts: this.options.embedFonts ?? true,
        sections: this.options.sections ?? [],
        widgets: {
          runStrip: this.options.widgets?.runStrip ?? true,
          outcome: this.options.widgets?.outcome ?? true,
          attention: this.options.widgets?.attention ?? true,
          dimensions: this.options.widgets?.dimensions ?? true,
          timeline: this.options.widgets?.timeline ?? true,
          durations: this.options.widgets?.durations ?? true,
          tags: this.options.widgets?.tags ?? true,
          slowest: this.options.widgets?.slowest ?? true,
          projects: this.options.widgets?.projects ?? true,
          flaky: this.options.widgets?.flaky ?? true,
          environment: this.options.widgets?.environment ?? true,
          skipped: this.options.widgets?.skipped ?? true,
        },
        dimensions: this.dimensions(),
        dimensionOrder: {
          priority: ['P0', 'P1', 'P2', 'P3', 'P4'],
          severity: ['blocker', 'critical', 'major', 'high', 'medium', 'normal', 'minor', 'low', 'trivial'],
          ...(this.options.dimensionOrder ?? {}),
        },
        project: this.options.project,
        links: this.options.links ?? {},
        customCss: this.options.customCss ?? '',
        editorLinks: this.options.editorLinks ?? !process.env.CI,
      },
    };

    const file = path.join(this.outDir, this.options.outputFile ?? 'index.html');
    fs.writeFileSync(file, renderHtml(data), 'utf8');
    if (this.options.announce !== false) {
      const rel = path.relative(process.cwd(), file);
      console.log(`\n  reporting-labs: report written to ${rel}`);
      this.printMissingMeta(tests);
      console.log('');
    }
    this.maybeOpen(file, result);
  }

  /** One short list of tests that carry no meta() at all, so the whole team keeps the report useful. */
  private printMissingMeta(tests: TestData[]) {
    if (this.options.warnMissingMeta === false) return;
    const seen = new Set<string>();
    const missing = tests.filter(t => Object.keys(t.meta).length === 0 && !seen.has(t.file + ':' + t.line) && seen.add(t.file + ':' + t.line));
    if (!missing.length) return;
    const total = new Set(tests.map(t => t.file + ':' + t.line)).size;
    console.log(`  reporting-labs: ${missing.length} of ${total} tests have no meta()`);
    const show = missing.slice(0, 15);
    const w = Math.max(...show.map(t => (t.file + ':' + t.line).length));
    for (const t of show) console.log(`    ${(t.file + ':' + t.line).padEnd(w)}  ${t.title}`);
    if (missing.length > show.length) console.log(`    … and ${missing.length - show.length} more`);
    console.log("    Add meta({ priority: 'P1', owner: 'name', feature: 'area' }) at the top of the test. Set warnMissingMeta: false to hide this.");
  }

  /** Open the report in the default browser, like Playwright's HTML reporter. Never in CI. */
  private maybeOpen(file: string, result: FullResult) {
    const mode = this.options.open ?? 'on-failure';
    if (mode === 'never' || process.env.CI) return;
    if (mode === 'on-failure' && result.status === 'passed') return;
    try {
      const cmd = process.platform === 'darwin' ? ['open', [file]] as const
        : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] as const
        : ['xdg-open', [file]] as const;
      const child = spawn(cmd[0], [...cmd[1]], { detached: true, stdio: 'ignore' });
      child.on('error', () => { /* no opener available, the path was printed above */ });
      child.unref();
    } catch { /* ignore */ }
  }

  // ---- helpers -------------------------------------------------------------

  /** Videos and traces are finalized asynchronously by the runner; wait until every file-backed attachment stops growing.
   *  All files are polled in parallel so total wait is bounded by the slowest single file, not the sum. */
  private async settleAttachmentFiles(): Promise<void> {
    const paths = new Set<string>();
    for (const test of this.suite.allTests()) for (const r of test.results) for (const a of r.attachments) if (a.path) paths.add(a.path);
    if (!paths.size) return;
    const size = (p: string) => { try { return fs.statSync(p).size; } catch { return -1; } };
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const wait = async (p: string) => {
      let last = size(p);
      if (last < 0) return;                         // never appeared; nothing to wait for
      for (let i = 0; i < 20; i++) {                 // up to ~5 s per file
        await sleep(250);
        const now = size(p);
        if (now === last && now > 0) return;          // stable and non-empty: settled
        last = now;
      }
    };
    await Promise.all([...paths].map(wait));
  }

  /** Runtime facts for the Environment card: Playwright, Node, OS, browsers, CI job, git commit. */
  private collectEnv(base: string): EnvRow[] {
    const rows: EnvRow[] = [];
    const env = process.env;
    let pw = '';
    try { pw = require('@playwright/test/package.json').version; } catch { /* not resolvable */ }
    if (pw) rows.push({ k: 'Playwright', v: pw });
    rows.push({ k: 'Node', v: process.version });
    rows.push({ k: 'OS', v: `${os.type()} ${os.release()} (${os.arch()})` });
    const browsers = [...new Set(this.config.projects.map(p => { const u: any = p.use ?? {}; return [u.browserName, u.channel].filter(Boolean).join('/') || (u.defaultBrowserType ?? ''); }).filter(Boolean))];
    if (browsers.length) rows.push({ k: 'Browsers', v: browsers.join(', ') });
    if (this.config.shard) rows.push({ k: 'Shard', v: `${this.config.shard.current} of ${this.config.shard.total}` });
    if (this.config.workers) rows.push({ k: 'Workers', v: String(this.config.workers) });
    const ci = ciLink(env);
    if (ci) rows.push({ k: 'CI', v: ci.name, href: ci.url });
    const git = gitInfo(base, env);
    if (git.sha) rows.push({ k: 'Commit', v: `${git.sha.slice(0, 7)}${git.author ? ' · ' + git.author : ''}${git.subject ? ' · ' + git.subject : ''}`, href: git.url });
    if (git.branch && !this.options.metadata?.branch) rows.push({ k: 'Branch', v: git.branch });
    for (const [k, v] of Object.entries(this.options.env ?? {})) rows.push({ k, v: String(v), href: /^https?:\/\//.test(String(v)) ? String(v) : undefined });
    return rows;
  }

  private toDataBlock(name: string, raw: string): ResultData['data'][number] {
    let v: any; try { v = JSON.parse(raw); } catch { return { name, kind: 'text', text: this.masker.maskStr(raw) }; }
    if (v && typeof v === 'object' && typeof v.csv === 'string' && Object.keys(v).length === 1) {
      const { columns, rows } = parseCsv(v.csv);
      const masked = rows.map(r => r.map((c, i) => this.masker.isSensitive(columns[i] ?? '') ? '****' : this.masker.maskStr(c)));
      return { name, kind: 'table', columns, rows: masked };
    }
    v = this.masker.mask(v);
    if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
      const columns = [...new Set(v.flatMap((x: any) => Object.keys(x)))];
      return { name, kind: 'table', columns, rows: v.map((x: any) => columns.map(c => fmt(x[c]))) };
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) return { name, kind: 'kv', kv: Object.entries(v).map(([k, x]) => [k, fmt(x)]) };
    return { name, kind: 'text', text: JSON.stringify(v, null, 2) };
  }

  private loadHistory(base: string): { file: string; entries: HistoryEntry[] } {
    const file = path.resolve(base, this.options.history?.file ?? 'reporting-labs.history.json');
    let entries: HistoryEntry[] = [];
    try { entries = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
    return { file, entries };
  }

  private dimensions(): string[] {
    return (this.options.dimensions ?? ['priority', 'severity', 'feature', 'owner']).map(d => d.toLowerCase());
  }

  /** Keys picked up from tags and annotations even when they are not breakdown dimensions. */
  private metaKeys(): string[] {
    return [...new Set([...this.dimensions(), ...META_KEYS, ...Object.keys(this.options.links ?? {}).map(k => k.toLowerCase())])].filter(k => k !== '*');
  }

  /** Pull meta values (priority, owner, story, epic...) from annotations and tags. */
  private extractMeta(test: TestCase): Record<string, string> {
    const dims = this.metaKeys();
    const meta: Record<string, string> = {};
    // Tags first (describe-level, then test-level), annotations last so a test can override its describe's tags.
    for (const raw of test.tags) {
      const tag = raw.replace(/^@/, '');
      const m = tag.match(/^([a-z_-]+)[:=](.+)$/i);
      if (m && dims.includes(m[1].toLowerCase())) { meta[m[1].toLowerCase()] = m[2]; continue; }
      if (/^P[0-4]$/i.test(tag) && dims.includes('priority') && !meta.priority) meta.priority = tag.toUpperCase();
      if (/^(blocker|critical|major|minor|trivial)$/i.test(tag) && dims.includes('severity') && !meta.severity) meta.severity = tag.toLowerCase();
    }
    for (const a of test.annotations) {
      const k = a.type.toLowerCase();
      if (dims.includes(k) && a.description) meta[k] = a.description;
    }
    return meta;
  }

  /** A local image file (path relative to the config) is embedded as a data URI so the report stays self-contained. URLs and data URIs pass through. */
  private resolveLogo(logo?: string): string | undefined {
    if (!logo || /^(https?:|data:)/i.test(logo)) return logo;
    const base = this.config.configFile ? path.dirname(this.config.configFile) : this.config.rootDir;
    const file = path.resolve(base, logo);
    if (!fs.existsSync(file)) { console.warn(`reporting-labs: logo not found at ${file}`); return undefined; }
    const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon' };
    const type = mime[path.extname(file).toLowerCase()];
    if (!type) { console.warn(`reporting-labs: logo ${logo} is not a png, jpg, svg, gif or webp file`); return undefined; }
    return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
  }

  private rel(file: string): string {
    const base = this.config.configFile ? path.dirname(this.config.configFile) : this.config.rootDir;
    return path.relative(base, file).split(path.sep).join('/');
  }

  private serializeError(e: TestError): ErrorData {
    const out: ErrorData = { message: stripAnsi(e.message ?? e.value ?? '') };
    const why = explainError(out.message); if (why) out.explain = why;
    if (e.stack) out.stack = stripAnsi(e.stack);
    if (e.snippet) out.snippet = stripAnsi(e.snippet);
    if (e.location) out.location = { file: this.rel(e.location.file), line: e.location.line, column: e.location.column };
    return out;
  }

  private outcome(test: TestCase): { outcome: Status; expectedFailure?: boolean; note?: string } {
    const o = test.outcome();
    const last = test.results[test.results.length - 1];
    const xfail = test.expectedStatus === 'failed';
    if (o === 'expected') {
      if (test.results.some(r => r.status === 'skipped') && test.results.length === 1) return { outcome: 'skipped' };
      if (xfail) return { outcome: 'passed', expectedFailure: true, note: 'Failed as expected: this test is marked test.fail(). The failure below is the known one.' };
      return { outcome: 'passed' };
    }
    if (o === 'skipped') return { outcome: 'skipped' };
    if (o === 'flaky') return { outcome: 'flaky' };
    if (!last) return { outcome: 'interrupted', note: 'This test never ran: the run was interrupted before it started.' };
    if (last.status === 'timedOut') return { outcome: 'timedOut', note: `Exceeded the ${test.timeout >= 1000 ? (test.timeout / 1000).toFixed(test.timeout % 1000 ? 1 : 0) + 's' : test.timeout + 'ms'} timeout.` };
    if (last.status === 'interrupted') return { outcome: 'interrupted', note: 'The run was interrupted while this test was executing.' };
    if (xfail && last.status === 'passed') return { outcome: 'failed', note: 'Passed, but the test is marked test.fail(). If the bug is fixed, remove the marker.' };
    return { outcome: 'failed' };
  }

  private titlePath(test: TestCase): string[] {
    const parts: string[] = [];
    let s: Suite | undefined = test.parent;
    while (s) {
      if (s.type === 'describe' && s.title) parts.unshift(s.title);
      s = s.parent;
    }
    return parts;
  }

  private serializeResult(r: TestResult, test: TestCase): ResultData {
    const logs: ResultData['logs'] = [], data: ResultData['data'] = [], api: ResultData['api'] = [];
    const normal: TestResult['attachments'] = [];
    for (const a of r.attachments) {
      const body = a.body ?? (a.path && fs.existsSync(a.path) ? fs.readFileSync(a.path) : undefined);
      if (a.contentType === 'application/x-rl-log' && body) { try { const l = JSON.parse(body.toString()); logs.push({ t: l.t, msg: this.masker.maskStr(String(l.msg)) }); } catch { /* ignore */ } continue; }
      if (a.contentType === 'application/x-rl-api' && body) { try { api.push(this.masker.mask(JSON.parse(body.toString())) as any); } catch { /* ignore */ } continue; }
      if (a.contentType === 'application/x-rl-data' && body) { data.push(this.toDataBlock(a.name, body.toString())); continue; }
      if (body && (a.contentType === 'text/csv' || /\.csv$/i.test(a.name))) { data.push(this.toDataBlock(a.name, JSON.stringify({ csv: body.toString() }))); continue; }
      // Plain test.info().attach(name, { body: JSON.stringify(x), contentType: 'application/json' }) renders like testData().
      if (body && a.contentType === 'application/json' && body.length <= 512 * 1024) {
        const block = this.toDataBlock(a.name, body.toString());
        if (block.kind !== 'text') { data.push(block); continue; }
      }
      normal.push(a);
    }
    return {
      logs: logs.sort((x, y) => x.t - y.t), data, api,
      retry: r.retry,
      status: r.status,
      duration: r.duration,
      startTime: r.startTime.getTime(),
      workerIndex: r.parallelIndex,
      errors: r.errors.map(e => this.serializeError(e)),
      steps: r.steps.filter(s => !isInternalAttach(s)).map(s => this.serializeStep(s)),
      attachments: normal.map(a => this.serializeAttachment(a, test)).filter(Boolean) as AttachmentData[],
      stdout: r.stdout.map(c => this.masker.maskStr(stripAnsi(c.toString()))),
      stderr: r.stderr.map(c => this.masker.maskStr(stripAnsi(c.toString()))),
    };
  }

  private serializeStep(s: TestStep): StepData {
    return {
      title: s.title,
      category: s.category,
      duration: s.duration,
      error: s.error?.message ? stripAnsi(s.error.message) : undefined,
      steps: s.steps.filter(c => !isInternalAttach(c)).map(c => this.serializeStep(c)),
    };
  }

  private serializeAttachment(a: TestResult['attachments'][number], test: TestCase): AttachmentData | null {
    const out: AttachmentData = { name: a.name, contentType: a.contentType };
    const embed = this.options.embedAttachments ?? true;
    const limit = this.options.embedLimit ?? DEFAULT_EMBED_LIMIT;
    const isImage = a.contentType.startsWith('image/');
    const isVideo = a.contentType.startsWith('video/');
    const isText = a.contentType.startsWith('text/') || a.contentType.includes('json');
    const canEmbed = embed && (isImage || (isVideo && this.options.embedVideos));

    let body: Buffer | undefined = a.body;
    if (!body && a.path && fs.existsSync(a.path)) {
      const size = fs.statSync(a.path).size;
      out.size = size;
      if (size <= limit && (canEmbed || isText)) body = fs.readFileSync(a.path);
    }
    if (body) {
      out.size = out.size ?? body.length;
      if (isText) { out.text = this.masker.maskStr(body.toString('utf8').slice(0, 20000)); return out; }
      if (canEmbed && body.length <= limit) { out.src = `data:${a.contentType};base64,${body.toString('base64')}`; return out; }
      if (!a.path) {
        // body-only attachment that we don't want inline (large or binary): write it to assets
        const name = `${sanitize(test.title)}-${a.name.replace(/[^a-z0-9.-]/gi, '_')}-${this.assetCounter++}${extFor(a.contentType)}`;
        fs.writeFileSync(path.join(this.assetsDir, name), body);
        out.src = `assets/${name}`;
        return out;
      }
    }
    if (a.path && fs.existsSync(a.path)) {
      const ext = path.extname(a.path) || extFor(a.contentType);
      const name = `${sanitize(test.title)}-${a.name.replace(/[^a-z0-9.-]/gi, '_')}-${this.assetCounter++}${ext}`;
      fs.copyFileSync(a.path, path.join(this.assetsDir, name));
      out.src = `assets/${name}`;
      return out;
    }
    return null;
  }
}

/** Run number from the CI system, used to label history entries when metadata.build is not set. */
function ciRunLabel(env: NodeJS.ProcessEnv): string | undefined {
  const n = env.GITHUB_RUN_NUMBER || env.BUILD_NUMBER || env.CI_PIPELINE_IID || env.CIRCLE_BUILD_NUM || env.BUILD_BUILDNUMBER || env.BITBUCKET_BUILD_NUMBER;
  return n ? `#${n}` : undefined;
}

function ciLink(env: NodeJS.ProcessEnv): { name: string; url?: string } | null {
  if (env.GITHUB_ACTIONS && env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID)
    return { name: `GitHub Actions #${env.GITHUB_RUN_NUMBER ?? env.GITHUB_RUN_ID}`, url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` };
  if (env.GITLAB_CI && env.CI_JOB_URL) return { name: `GitLab CI #${env.CI_PIPELINE_IID ?? env.CI_JOB_ID}`, url: env.CI_JOB_URL };
  if (env.JENKINS_URL && env.BUILD_URL) return { name: `Jenkins ${env.JOB_NAME ?? ''} #${env.BUILD_NUMBER ?? ''}`.trim(), url: env.BUILD_URL };
  if (env.CIRCLECI && env.CIRCLE_BUILD_URL) return { name: `CircleCI #${env.CIRCLE_BUILD_NUM ?? ''}`.trim(), url: env.CIRCLE_BUILD_URL };
  if (env.TF_BUILD && env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI && env.SYSTEM_TEAMPROJECT && env.BUILD_BUILDID)
    return { name: `Azure Pipelines #${env.BUILD_BUILDNUMBER ?? env.BUILD_BUILDID}`, url: `${env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI}${env.SYSTEM_TEAMPROJECT}/_build/results?buildId=${env.BUILD_BUILDID}` };
  if (env.BITBUCKET_BUILD_NUMBER && env.BITBUCKET_GIT_HTTP_ORIGIN) return { name: `Bitbucket Pipelines #${env.BITBUCKET_BUILD_NUMBER}`, url: `${env.BITBUCKET_GIT_HTTP_ORIGIN}/addon/pipelines/home#!/results/${env.BITBUCKET_BUILD_NUMBER}` };
  if (env.CI) return { name: 'CI' };
  return null;
}

function gitInfo(cwd: string, env: NodeJS.ProcessEnv): { sha?: string; author?: string; subject?: string; branch?: string; url?: string } {
  const out: { sha?: string; author?: string; subject?: string; branch?: string; url?: string } = {};
  const run = (cmd: string) => { try { return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim(); } catch { return ''; } };
  const line = run('git log -1 --format=%H%x1f%an%x1f%s');
  if (line) { const [sha, author, subject] = line.split('\x1f'); out.sha = sha; out.author = author; out.subject = subject; }
  out.sha = out.sha || env.GITHUB_SHA || env.CI_COMMIT_SHA || env.GIT_COMMIT || env.CIRCLE_SHA1 || env.BUILD_SOURCEVERSION || undefined;
  out.author = out.author || env.GITHUB_ACTOR || env.CI_COMMIT_AUTHOR || undefined;
  const branch = run('git rev-parse --abbrev-ref HEAD');
  out.branch = (branch && branch !== 'HEAD' ? branch : '') || env.GITHUB_REF_NAME || env.CI_COMMIT_REF_NAME || env.GIT_BRANCH || env.BUILD_SOURCEBRANCHNAME || undefined;
  if (out.sha) {
    if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY) out.url = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/commit/${out.sha}`;
    else if (env.CI_PROJECT_URL) out.url = `${env.CI_PROJECT_URL}/-/commit/${out.sha}`;
    else { const remote = run('git config --get remote.origin.url'); const m = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/); if (m) out.url = `https://github.com/${m[1]}/commit/${out.sha}`; }
  }
  return out;
}

function extFor(ct: string) {
  const m: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'video/webm': '.webm', 'video/mp4': '.mp4', 'application/zip': '.zip', 'application/pdf': '.pdf' };
  return m[ct] ?? '';
}
function fmt(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function stripAnsi(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}
function sanitize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
