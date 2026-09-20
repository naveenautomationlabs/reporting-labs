export interface ReportingLabsOptions {
  /** Report title shown in the header. Default: "Test report" */
  title?: string;
  /** Your logo: a file path relative to the config (e.g. 'logo.png', embedded into the report), an https URL, or a data URI. */
  logo?: string;
  /** Override the palette accent with your brand color, e.g. '#7C3AED'. Default: the palette's own accent (royal blue for `lab`). */
  accent?: string;
  /** Color theme. Default: "auto" (follows OS) */
  theme?: 'auto' | 'light' | 'dark';
  /** Color palette. Default: "lab" (blue + white). Viewers can switch in the header. */
  palette?: 'lab' | 'ocean' | 'ember' | 'mono';
  /** Output folder for the report and copied attachments. Default: "reporting-labs" */
  outputFolder?: string;
  /** Output HTML file name inside outputFolder. Default: "index.html" */
  outputFile?: string;
  /** Inline screenshots as base64 (single file, opens anywhere). Default: true */
  embedAttachments?: boolean;
  /** Max size (bytes) of a single attachment to embed. Larger ones are copied as files. Default: 2 MB */
  embedLimit?: number;
  /** Inline videos as base64 too (makes the file big). Default: false – videos are copied to ./assets */
  embedVideos?: boolean;
  /** Key/value shown in the header (env, branch, build...). `build` labels the run in the history; when it is not set the CI run number is used. */
  metadata?: Record<string, string>;
  /** Extra sections rendered below the summary. HTML is allowed. */
  sections?: Array<{ title: string; html: string }>;
  /** Hide widgets you don't need. */
  widgets?: {
    runStrip?: boolean;
    outcome?: boolean;
    attention?: boolean;
    dimensions?: boolean;
    timeline?: boolean;
    durations?: boolean;
    tags?: boolean;
    slowest?: boolean;
    projects?: boolean;
    /** Flakiest tests over the run history. Default: true */
    flaky?: boolean;
    /** Environment card (Playwright, Node, OS, browsers, CI, commit). Default: true */
    environment?: boolean;
    /** Skipped tests with their reasons. Default: true */
    skipped?: boolean;
  };
  /**
   * Annotation/tag keys treated as chart dimensions (priority, severity, owner...).
   * Set via meta({ priority: 'P1' }) in tests, annotations, or tags like @priority:P1 / @P1.
   * Default: ['priority', 'severity', 'feature', 'owner']
   */
  dimensions?: string[];
  /** Custom value order for a dimension, e.g. { severity: ['blocker','critical','major','minor'] } */
  dimensionOrder?: Record<string, string[]>;
  /** Extra CSS appended to the report. */
  customCss?: string;
  /** Embed IBM Plex Sans/Mono in the HTML (~140 KB) so the report looks the same everywhere, offline. Default: true */
  embedFonts?: boolean;
  /** Print report path to the console after the run. Default: true */
  announce?: boolean;
  /** After the run, list the tests that have no meta() in the console. Default: true */
  warnMissingMeta?: boolean;
  /** Open the report in the browser after the run: 'on-failure' (default), 'always' or 'never'. Never opens in CI. */
  open?: 'on-failure' | 'always' | 'never';
  /** Company / project block in the header. */
  project?: { name?: string; version?: string; url?: string; description?: string; team?: string };
  /**
   * Turn meta values into links. Key = meta key (story, epic, ticket, issue, jira...), value = URL template with {id}.
   * e.g. { story: 'https://acme.atlassian.net/browse/{id}', epic: 'https://acme.atlassian.net/browse/{id}' }
   */
  links?: Record<string, string>;
  /** Keys (case-insensitive substrings) whose values are masked in test data and API panels. */
  maskKeys?: string[];
  /** Keep a rolling run history next to the report and draw a trend chart. Per-test outcomes are stored too, which powers new-vs-known failures, flaky history and duration regressions. */
  history?: { enabled?: boolean; file?: string; keep?: number };
  /** Extra rows for the Environment card, e.g. { 'App version': '2.4.0', 'Test data': 'staging-seed-12' }. Values that are URLs become links. */
  env?: Record<string, string>;
  /** Show an "Open in VS Code" link on every test (vscode://file/...). Default: true locally, false when the CI env var is set. */
  editorLinks?: boolean;
  /** Style Given/When/Then steps as Gherkin and label describe blocks as Features/Scenarios. Default: auto-detect */
  bdd?: boolean;
}

/** Lets you type a known value and still accept any string. */
export type Loose<T extends string> = T | (string & {});

/**
 * Metadata for one test. Known keys get charts, filters and links in the report;
 * any extra key is allowed and shows as a chip on the test.
 * Extend the known keys for your team via module augmentation:
 *
 *   declare module 'reporting-labs' { interface CustomMeta { team?: 'web' | 'mobile' } }
 */
export interface TestMeta extends CustomMeta {
  /** Business priority. P0 = must never break, P3 = nice to have. Drives "Needs attention" ranking. */
  priority?: Loose<'P0' | 'P1' | 'P2' | 'P3' | 'P4'>;
  /** Impact if this fails. */
  severity?: Loose<'blocker' | 'critical' | 'major' | 'minor' | 'trivial'>;
  /** Person or team who owns this test. */
  owner?: string;
  /** Feature / module under test, e.g. 'checkout'. */
  feature?: string;
  /** Epic key, e.g. 'EPIC-18'. Becomes a link when `links.epic` is configured. */
  epic?: string;
  /** User story key, e.g. 'SHOP-250'. Becomes a link when `links.story` is configured. */
  story?: string;
  /** Bug / issue key this test guards against, e.g. 'PROMO-118'. */
  issue?: string;
  /** Test case id in your TCM tool (TestRail, Xray, Zephyr...). */
  testCaseId?: string;
  /** Free-form tags or any other key you like. */
  [key: string]: string | number | undefined;
}
/** Empty by default; augment it to add typed keys of your own. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CustomMeta {}

export interface ApiCall {
  /** HTTP method. */
  method: Loose<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'>;
  url: string;
  status?: number;
  duration?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  name?: string;
}

export interface HistoryEntry {
  time: number;
  duration: number;
  passed: number; failed: number; flaky: number; skipped: number; total: number;
  label?: string;
  /** Per-test outcome and last-attempt duration, keyed by TestData.key. Codes: p passed, f failed, k flaky, s skipped. */
  tests?: Record<string, [string, number]>;
}

export interface EnvRow { k: string; v: string; href?: string }

export type Status = 'passed' | 'failed' | 'skipped' | 'flaky' | 'timedOut' | 'interrupted';

export interface ErrorExplainData { kind: string; label: string; summary: string; hint?: string; locator?: string; action?: string; matcher?: string; timeoutMs?: number; url?: string }
export interface ErrorData { message: string; stack?: string; snippet?: string; location?: { file: string; line: number; column: number }; /** Plain-language reading of the message, rule based. The message itself is always kept. */ explain?: ErrorExplainData }

export interface StepData {
  title: string;
  category: string;
  duration: number;
  error?: string;
  steps: StepData[];
}

export interface AttachmentData {
  name: string;
  contentType: string;
  /** data URI (embedded) or relative path (copied) */
  src?: string;
  /** small inline text bodies (stdout, json) */
  text?: string;
  /** bytes on disk, when known */
  size?: number;
}

export interface ResultData {
  retry: number;
  status: string;
  duration: number;
  startTime: number;
  workerIndex: number;
  errors: ErrorData[];
  steps: StepData[];
  attachments: AttachmentData[];
  stdout: string[];
  stderr: string[];
  logs: { t: number; msg: string }[];
  data: { name: string; kind: 'table' | 'kv' | 'text'; columns?: string[]; rows?: string[][]; kv?: [string, string][]; text?: string }[];
  api: ApiCall[];
}

export interface TestData {
  id: string;
  /** Stable identity across runs: project, file and full title. Used to match history entries. */
  key: string;
  title: string;
  /** describe blocks, outermost first */
  path: string[];
  file: string;
  line: number;
  project: string;
  tags: string[];
  annotations: { type: string; description?: string }[];
  /** extracted dimension values, e.g. { priority: 'P1', severity: 'critical' } */
  meta: Record<string, string>;
  outcome: Status;
  duration: number;
  results: ResultData[];
  /** Playwright's expected status: 'failed' for test.fail(), 'skipped' for fixme/skip. */
  expectedStatus?: string;
  /** True when the test is marked test.fail() and failed as expected (counted as passed). */
  expectedFailure?: boolean;
  /** Explains an outcome that has no error of its own, e.g. a test.fail() test that unexpectedly passed. */
  note?: string;
  timeout?: number;
  retries?: number;
  column?: number;
}

export interface ReportData {
  title: string;
  generatedAt: number;
  startTime: number;
  duration: number;
  metadata: Record<string, string>;
  projects: string[];
  workers: number;
  stats: Record<Status, number> & { total: number };
  tests: TestData[];
  history: HistoryEntry[];
  bdd: boolean;
  /** Directory the config lives in; test files are relative to it. */
  rootDir: string;
  env: EnvRow[];
  /** Overall run status from Playwright: interrupted (Ctrl+C) or timedout (globalTimeout) mean tests did not finish. */
  runStatus: 'passed' | 'failed' | 'timedout' | 'interrupted';
  /** Errors reported outside any test: spec files that failed to load, global setup, worker crashes. */
  globalErrors: ErrorData[];
  /** Console output that was not attributed to a test. */
  globalOutput: { stream: 'out' | 'err'; text: string }[];
  shard?: { current: number; total: number };
  options: {
    logo?: string;
    accent?: string;
    theme: 'auto' | 'light' | 'dark';
    palette: 'lab' | 'ocean' | 'ember' | 'mono';
    embedFonts: boolean;
    sections: Array<{ title: string; html: string }>;
    widgets: Required<NonNullable<ReportingLabsOptions['widgets']>>;
    dimensions: string[];
    dimensionOrder: Record<string, string[]>;
    project?: ReportingLabsOptions['project'];
    links: Record<string, string>;
    customCss: string;
    editorLinks: boolean;
  };
}
