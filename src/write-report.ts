/**
 * Builds the report from finished tests and writes index.html, report.json and (best effort) report.pdf.
 * Shared by the runners that collect tests themselves (WebdriverIO, Cypress); the Playwright reporter has its own.
 */
import * as fs from 'fs';
import * as path from 'path';
import { renderHtml } from './template';
import { makeMasker } from './mask';
import { writeReportPdf } from './pdf';
import type { ReportData, TestData, HistoryEntry, Status, EnvRow } from './types';
import { collectEnv, ciRunLabel } from './wdio/env';

export interface WriteReportOptions {
  outputFolder?: string;
  outputFile?: string;
  jsonFile?: string;
  emitJson?: boolean;
  pdf?: boolean | { file?: string; chromePath?: string };
  title?: string;
  logo?: string;
  accent?: string;
  theme?: 'auto' | 'light' | 'dark';
  palette?: 'lab' | 'ocean' | 'ember' | 'mono';
  metadata?: Record<string, string>;
  env?: Record<string, string>;
  sections?: { title: string; html: string }[];
  customCss?: string;
  dimensions?: string[];
  dimensionOrder?: Record<string, string[]>;
  project?: unknown;
  links?: Record<string, unknown>;
  bdd?: boolean;
  announce?: boolean;
  history?: { enabled?: boolean; file?: string; keep?: number };
  maskKeys?: string[];
  maskValues?: string[];
  maskFromEnv?: boolean;
  embedFonts?: boolean;
  editorLinks?: boolean;
  expandFailedSteps?: boolean;
}

/** Run-level facts the runner knows. */
export interface RunInfo {
  startTime: number;
  endTime: number;
  runStatus: 'passed' | 'failed';
  workers: number;
  /** Rows shown first on the Environment card, e.g. the Cypress version and browser. */
  envRows?: EnvRow[];
}

/** Writes the report into options.outputFolder (default reporting-labs) and returns the HTML path. */
export async function writeReport(tests: TestData[], run: RunInfo, options: WriteReportOptions = {}): Promise<string> {
  const outputFolder = options.outputFolder || 'reporting-labs';
  const masker = makeMasker(options.maskKeys || [], { knownValues: options.maskValues || [], fromEnv: options.maskFromEnv !== false });
  const { startTime, endTime, runStatus, workers } = run;
  const stats: ReportData['stats'] = { passed: 0, failed: 0, skipped: 0, flaky: 0, timedOut: 0, interrupted: 0, total: tests.length };
  for (const t of tests) stats[t.outcome]++;
  const projects = [...new Set(tests.map(t => t.project).filter(Boolean))];

  const base = process.cwd();
  const dims = (options.dimensions ?? ['priority', 'severity', 'feature', 'owner']).map(d => d.toLowerCase());
  const histOn = options.history?.enabled ?? true;
  const histFile = path.resolve(base, options.history?.file ?? 'reporting-labs.history.json');
  let entries: HistoryEntry[] = [];
  if (histOn) { try { entries = JSON.parse(fs.readFileSync(histFile, 'utf8')); } catch { /* first run */ } }
  const failedCount = stats.failed + stats.timedOut + stats.interrupted;
  const code = (o: Status) => o === 'passed' ? 'p' : o === 'flaky' ? 'k' : o === 'skipped' ? 's' : 'f';
  const perTest: Record<string, [string, number]> = {};
  for (const t of tests) { const last = t.results[t.results.length - 1]; perTest[t.key] = [code(t.outcome), Math.round(last?.duration ?? t.duration)]; }
  const current: HistoryEntry = {
    time: startTime, duration: endTime - startTime,
    passed: stats.passed, failed: failedCount, flaky: stats.flaky, skipped: stats.skipped, total: stats.total,
    label: options.metadata?.build ?? ciRunLabel(process.env) ?? options.metadata?.branch, tests: perTest,
  };
  const history = [...entries, current].slice(-(options.history?.keep ?? 30));
  if (histOn) { try { fs.writeFileSync(histFile, JSON.stringify(history, null, 1)); } catch { /* read-only fs */ } }

  const metadata = Object.fromEntries(Object.entries(options.metadata ?? {}).map(([k, v]) => [k, masker.maskStr(String(v))]));
  const bdd = options.bdd ?? tests.some(t => t.results.some(r => r.steps.some(st => /^(Given|When|Then|And|But)\b/.test(st.title))));

  const data: ReportData = {
    title: masker.maskStr(options.title ?? 'Test report'),
    generatedAt: Date.now(),
    startTime,
    duration: endTime - startTime,
    metadata,
    projects,
    workers,
    stats,
    tests,
    history,
    bdd,
    rootDir: base,
    env: [...(run.envRows ?? []), ...collectEnv(base, Object.fromEntries(Object.entries(options.env ?? {}).map(([k, v]) => [k, masker.maskStr(String(v))])), [...new Set(projects)], workers, options.metadata?.branch)].map(r => ({ ...r, v: masker.maskStr(r.v) })),
    runStatus,
    globalErrors: [],
    globalOutput: [],
    options: {
      logo: options.logo,
      accent: options.accent,
      theme: options.theme ?? 'auto',
      palette: options.palette ?? 'lab',
      embedFonts: options.embedFonts ?? true,
      sections: options.sections ?? [],
      widgets: { runStrip: true, outcome: true, attention: true, dimensions: true, timeline: true, durations: true, tags: true, slowest: true, projects: true, flaky: true, environment: true, skipped: true },
      dimensions: dims,
      dimensionOrder: {
        priority: ['P0', 'P1', 'P2', 'P3', 'P4'],
        severity: ['blocker', 'critical', 'major', 'high', 'medium', 'normal', 'minor', 'low', 'trivial'],
        ...(options.dimensionOrder ?? {}),
      },
      project: options.project as ReportData['options']['project'],
      links: Object.fromEntries(Object.entries(options.links ?? {}).map(([k, v]) => [k.toLowerCase(), typeof v === 'string' ? v : (v as { url: string }).url])),
      customCss: options.customCss ?? '',
      editorLinks: options.editorLinks ?? !process.env.CI,
      expandFailedSteps: options.expandFailedSteps ?? true,
    },
  } as ReportData;

  fs.mkdirSync(outputFolder, { recursive: true });
  const htmlFile = path.join(outputFolder, options.outputFile ?? 'index.html');
  fs.writeFileSync(htmlFile, renderHtml(data), 'utf8');
  if (options.emitJson !== false) fs.writeFileSync(path.join(outputFolder, options.jsonFile ?? 'report.json'), JSON.stringify(data), 'utf8');

  if (options.announce !== false) {
    console.log(`\n  reporting-labs: report written to ${path.relative(process.cwd(), htmlFile)}`);
  }
  if (options.pdf !== false) await writePdf(htmlFile, outputFolder, options);
  if (options.announce !== false) console.log('');
  return htmlFile;
}

/** report.pdf next to the HTML; see writeReportPdf for which browser prints it (an installed Chrome or
 *  Edge when the project has no Playwright). Never fails the run. */
async function writePdf(htmlFile: string, outputFolder: string, options: WriteReportOptions): Promise<void> {
  const pdfOpt = typeof options.pdf === 'object' ? options.pdf : {};
  const pdfFile = path.join(outputFolder, pdfOpt.file || 'report.pdf');
  const r = await writeReportPdf(htmlFile, pdfFile, pdfOpt.chromePath);
  if (options.announce === false) return;
  console.log(r.ok ? `  reporting-labs: PDF written to ${path.relative(process.cwd(), pdfFile)}` : `  reporting-labs: PDF skipped — ${r.reason}`);
}
