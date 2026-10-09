/**
 * Combines the per-runner partials written by the WDIO reporter into the one report —
 * index.html, report.json and (best-effort) report.pdf. Call it from `onComplete` in wdio.conf:
 *
 *   import { reportingLabsComplete } from 'reporting-labs/wdio';
 *   export const config = {
 *     reporters: [[ReportingLabsWdioReporter, { outputFolder: 'reporting-labs' }]],
 *     async onComplete() { await reportingLabsComplete({ outputFolder: 'reporting-labs', title: 'My suite' }); },
 *   };
 */
import * as fs from 'fs';
import * as path from 'path';
import type { TestData } from '../types';
import { writeReport, type WriteReportOptions } from '../write-report';

export type ReportingLabsCompleteOptions = WriteReportOptions;

export async function reportingLabsComplete(options: ReportingLabsCompleteOptions = {}): Promise<string | undefined> {
  const outputFolder = options.outputFolder || 'reporting-labs';
  const partsDir = path.join(outputFolder, '.rl-wdio');
  if (!fs.existsSync(partsDir)) return undefined;

  const files = fs.readdirSync(partsDir).filter(f => f.endsWith('.json'));
  if (!files.length) return undefined;

  const tests: TestData[] = [];
  let startTime = Number.MAX_SAFE_INTEGER;
  let endTime = 0;
  let runStatus: 'passed' | 'failed' = 'passed';
  const workers = files.length;

  for (const f of files) {
    let part: { startTime?: number; endTime?: number; runStatus?: string; tests?: TestData[] };
    try { part = JSON.parse(fs.readFileSync(path.join(partsDir, f), 'utf8')); } catch { continue; }
    if (typeof part.startTime === 'number') startTime = Math.min(startTime, part.startTime);
    if (typeof part.endTime === 'number') endTime = Math.max(endTime, part.endTime);
    if (part.runStatus === 'failed') runStatus = 'failed';
    for (const t of part.tests || []) tests.push(t);
  }
  if (startTime === Number.MAX_SAFE_INTEGER) startTime = Date.now();
  if (!endTime) endTime = Date.now();

  // the partials are only needed for this report
  const htmlFile = await writeReport(tests, { startTime, endTime, runStatus, workers }, options);
  try { fs.rmSync(partsDir, { recursive: true, force: true }); } catch { /* leave them */ }
  return htmlFile;
}
