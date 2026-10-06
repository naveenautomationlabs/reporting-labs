import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { pathToFileURL } from 'url';

export interface PdfResult { ok: boolean; reason?: string }

/** Render the report's print layout to a PDF. Best-effort, never throws: a failure here must not fail
 *  the run — the HTML report and its Export PDF button remain.
 *  1. the Chromium that Playwright ships, when `@playwright/test` and its browser are installed;
 *  2. an installed Chrome, Edge or Chromium, headless with --print-to-pdf (the report builds its print
 *     layout itself on `?rl-print`). Edge ships with Windows, so this covers suites that run on Firefox
 *     or WebKit, and WebdriverIO projects that have no Playwright at all.
 *  `chromePath` (or the CHROME_PATH variable) names the browser explicitly and skips the search. */
export async function writeReportPdf(htmlFile: string, pdfFile: string, chromePath?: string): Promise<PdfResult> {
  try { fs.unlinkSync(pdfFile); } catch { /* none yet */ }   // never leave a previous run's PDF next to this report
  const explicit = chromePath || process.env.CHROME_PATH;
  let firstError = '';
  if (!explicit) {
    try {
      const { chromium } = await import('@playwright/test');
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
        await page.evaluate(() => (window as unknown as { reportingLabsPreparePrint?: () => Promise<unknown> }).reportingLabsPreparePrint?.());
        await page.pdf({ path: pdfFile, printBackground: true, preferCSSPageSize: true });
      } finally {
        await browser.close();
      }
      if (written(pdfFile)) return { ok: true };
    } catch (e) {
      firstError = String((e as Error).message).split('\n')[0];
    }
  }
  const chrome = explicit && isFile(explicit) ? explicit : findChrome();
  if (!chrome) {
    return { ok: false, reason: explicit ? `browser not found at ${explicit}` : 'no Chrome, Edge or Chromium found (set pdf: { chromePath }, or pdf: false to silence)' };
  }
  try {
    spawnSync(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer',
      '--virtual-time-budget=8000', '--run-all-compositor-stages-before-draw',
      '--print-to-pdf=' + pdfFile, pathToFileURL(htmlFile).href + '?rl-print=1'],
    { stdio: 'ignore', timeout: 120_000 });
  } catch (e) {
    return { ok: false, reason: String((e as Error).message).split('\n')[0] };
  }
  return written(pdfFile) ? { ok: true } : { ok: false, reason: firstError || `${path.basename(chrome)} did not write the PDF` };
}

function written(f: string): boolean {
  try { return fs.statSync(f).size > 0; } catch { return false; }
}

function isFile(f: string): boolean {
  try { return fs.statSync(f).isFile(); } catch { return false; }
}

function which(name: string): string | undefined {
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      try { fs.accessSync(p, fs.constants.X_OK); if (isFile(p)) return p; } catch { /* next */ }
    }
  }
  return undefined;
}

/** Any Chromium-based browser can print the report: Chrome, Edge or Chromium. */
export function findChrome(): string | undefined {
  const candidates: string[] = [];
  if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  }
  for (const c of candidates) if (isFile(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome',
    'microsoft-edge', 'microsoft-edge-stable', 'msedge']) {
    const p = which(name);
    if (p) return p;
  }
  for (const c of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']) if (isFile(c)) return c;
  return undefined;
}
