#!/usr/bin/env node
// Emit dist/template.html — the same HTML shell renderHtml produces, but with
// well-known placeholders for the fields any language port (Java today, more
// later) needs to inject at render time:
//
//   __RL_DATA__         — the report data JSON (the only required one)
//   __RL_ACCENT_CSS__   — a :root{--accent:...} block, or empty
//   __RL_CUSTOM_CSS__   — extra CSS the caller wants appended, or empty
//
// The placeholders are seeded with distinctive sentinels and then rewritten,
// so the surrounding CSS/HTML stays exactly what renderHtml produces.
//
// Runs AFTER `tsc` (dist/template.js has to exist).

'use strict';
const fs = require('fs');
const path = require('path');

const { renderHtml } = require('../dist/template');

const ACCENT_SENTINEL = '__RL_ACCENT_SENTINEL_1a56db_2026__';
const CUSTOM_SENTINEL = '/*__RL_CUSTOM_CSS_SENTINEL_2026__*/';

const seed = {
  title: '',
  generatedAt: 0,
  startTime: 0,
  duration: 0,
  metadata: {},
  projects: [],
  workers: 1,
  stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
  tests: [],
  history: [],
  bdd: false,
  rootDir: '',
  env: [],
  runStatus: 'passed',
  globalErrors: [],
  globalOutput: [],
  options: {
    theme: 'auto',
    palette: 'lab',
    embedFonts: true,
    sections: [],
    widgets: {
      overviewCards: true,
      breakdown: true,
      needsAttention: true,
      failureClusters: true,
      trend: true,
      slowest: true,
      env: true,
    },
    dimensions: ['priority', 'severity', 'owner', 'feature'],
    dimensionOrder: {},
    links: {},
    // Seed accent + customCss with sentinels so we know exactly where they
    // ended up in the rendered HTML.
    accent: ACCENT_SENTINEL,
    customCss: CUSTOM_SENTINEL,
    editorLinks: true,
  },
};

let html = renderHtml(seed);

// Data payload placeholder.
const dataRe = /<script id="rl-data" type="application\/json">[^<]*<\/script>/;
if (!dataRe.test(html)) {
  console.error('build-template: could not find rl-data script tag');
  process.exit(1);
}
html = html.replace(
  dataRe,
  '<script id="rl-data" type="application/json">__RL_DATA__</script>'
);

// Accent + customCss placeholders. renderHtml renders:
//   `:root{--accent:${accent}!important}` when accent is truthy,
//   then appends customCss verbatim.
// Replace those sentinel-anchored spans with named placeholders that hold
// nothing by default; the port fills them in at render time.
const accentBlock = `:root{--accent:${ACCENT_SENTINEL}!important}`;
if (!html.includes(accentBlock)) {
  console.error('build-template: accent sentinel not found in rendered HTML');
  process.exit(1);
}
html = html.replace(accentBlock, '__RL_ACCENT_CSS__');

if (!html.includes(CUSTOM_SENTINEL)) {
  console.error('build-template: customCss sentinel not found in rendered HTML');
  process.exit(1);
}
html = html.replace(CUSTOM_SENTINEL, '__RL_CUSTOM_CSS__');

const out = path.join(__dirname, '..', 'dist', 'template.html');
fs.writeFileSync(out, html);

const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`build-template: wrote ${out} (${sizeKb} KB)`);
