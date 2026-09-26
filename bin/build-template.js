#!/usr/bin/env node
// Emit dist/template.html — the same HTML shell renderHtml produces, but with
// the data JSON payload replaced by the string "__RL_DATA__" so any language
// port (currently Java) can embed this file, do a single string replace, and
// produce the same report.
//
// This runs AFTER `tsc` so that dist/template.js exists.

'use strict';
const fs = require('fs');
const path = require('path');

const { renderHtml } = require('../dist/template');

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
    customCss: '',
    editorLinks: true,
  },
};

const html = renderHtml(seed);

// Replace the data payload with the placeholder. renderHtml emits:
//   <script id="rl-data" type="application/json">{...}</script>
const dataRe = /<script id="rl-data" type="application\/json">[^<]*<\/script>/;
if (!dataRe.test(html)) {
  console.error('build-template: could not find rl-data script tag in renderHtml output');
  process.exit(1);
}
const withPlaceholder = html.replace(
  dataRe,
  '<script id="rl-data" type="application/json">__RL_DATA__</script>'
);

const out = path.join(__dirname, '..', 'dist', 'template.html');
fs.writeFileSync(out, withPlaceholder);

const sizeKb = (Buffer.byteLength(withPlaceholder) / 1024).toFixed(1);
console.log(`build-template: wrote ${out} (${sizeKb} KB)`);
