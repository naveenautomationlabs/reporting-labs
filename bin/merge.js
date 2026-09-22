// Merge several shard runs into one report.
// Usage: node bin/merge.js <shardDir1> <shardDir2> ... [-o <outDir>]
//        (invoked by bin/cli.js as `npx reporting-labs merge ...`)

'use strict';
const fs = require('fs');
const path = require('path');

function usage(exit = 0) {
  console.log(
`reporting-labs merge

  Combine several shard runs into one report.

Usage:
  npx reporting-labs merge <shard-dir> [<shard-dir> ...] [--out <dir>] [--file <name>]

Arguments:
  <shard-dir>          A folder that contains report.json (the shard's reporting-labs output).
                       You can also pass a parent folder that contains many shards, e.g.
                       "npx reporting-labs merge ./all-shards" where each subfolder is a shard.

Options:
  --out, -o <dir>      Where the merged report is written. Default: reporting-labs-merged
  --file <name>        Output HTML file name. Default: index.html
  --title <text>       Override the report title. Default: the first shard's title
  --help, -h           Show this message

Example (GitHub Actions):
  # each shard uploads its own reporting-labs/ folder as an artifact,
  # a final job downloads them all under ./all-shards/, then:
  npx reporting-labs merge ./all-shards -o merged/`);
  process.exit(exit);
}

function parseArgs(argv) {
  const dirs = [];
  const opts = { out: 'reporting-labs-merged', file: 'index.html', title: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--title') opts.title = argv[++i];
    else if (a.startsWith('-')) { console.error('unknown flag: ' + a); usage(1); }
    else dirs.push(a);
  }
  if (!dirs.length) usage(1);
  return { dirs, opts };
}

/** Expand each arg: if the arg is a shard dir (has report.json) keep it; otherwise treat as a parent and expand its immediate subdirs that have report.json. */
function resolveShardDirs(inputs) {
  const out = [];
  for (const p of inputs) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) { console.error('missing:', abs); process.exit(1); }
    if (fs.existsSync(path.join(abs, 'report.json'))) out.push(abs);
    else {
      const kids = fs.readdirSync(abs).map(k => path.join(abs, k)).filter(k => fs.statSync(k).isDirectory() && fs.existsSync(path.join(k, 'report.json')));
      if (!kids.length) { console.error(`no report.json under ${abs}, nor in any subfolder`); process.exit(1); }
      out.push(...kids);
    }
  }
  return out;
}

function rewriteAttachmentPath(a, prefix) {
  if (!a) return a;
  // The reporter emits 'src' pointing at 'assets/<name>' for file-backed attachments;
  // namespace it under the shard's folder so multiple shards can share one merged assets/.
  const src = a.src;
  if (typeof src === 'string' && src.startsWith('assets/')) return { ...a, src: 'assets/' + prefix + '/' + src.slice('assets/'.length) };
  return a;
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name), dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function shardLabel(dir, i, data) {
  if (data && data.shard && data.shard.total) return `shard-${data.shard.current}-of-${data.shard.total}`;
  return `shard-${i + 1}`;
}

function merge(inputs, opts) {
  const dirs = resolveShardDirs(inputs);
  console.log(`Merging ${dirs.length} shard${dirs.length === 1 ? '' : 's'} into ${opts.out}`);

  const shards = dirs.map((d, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(d, 'report.json'), 'utf8'));
    return { dir: d, label: shardLabel(d, i, data), data };
  });

  const first = shards[0].data;
  // Compose combined data. Start from the first shard's options/env, then merge in test rows.
  const combined = {
    ...first,
    title: opts.title || first.title,
    startTime: Math.min(...shards.map(s => s.data.startTime || 0)),
    duration: Math.max(...shards.map(s => s.data.duration || 0)),
    generatedAt: Date.now(),
    stats: { passed: 0, failed: 0, skipped: 0, flaky: 0, timedOut: 0, interrupted: 0, total: 0 },
    tests: [],
    globalErrors: [],
    globalOutput: [],
    projects: [],
    workers: shards.reduce((n, s) => n + (s.data.workers || 0), 0),
    shard: undefined,   // no longer sharded
    env: [...(first.env || [])],
    history: first.history || [],   // all shards share the same history file
  };

  const projSet = new Set();
  for (const s of shards) {
    const stats = s.data.stats || {};
    for (const k of Object.keys(combined.stats)) combined.stats[k] += stats[k] || 0;
    (s.data.projects || []).forEach(p => projSet.add(p));

    for (const t of (s.data.tests || [])) {
      const nt = {
        ...t,
        results: (t.results || []).map(r => ({
          ...r,
          attachments: (r.attachments || []).map(a => rewriteAttachmentPath(a, s.label)),
        })),
      };
      combined.tests.push(nt);
    }
    for (const e of (s.data.globalErrors || [])) combined.globalErrors.push(e);
    for (const o of (s.data.globalOutput || [])) combined.globalOutput.push(o);
  }
  combined.projects = [...projSet].sort();
  combined.env.push({ k: 'Shards', v: shards.map(s => s.label).join(', ') });
  if (combined.runStatus === undefined || combined.runStatus === 'passed') {
    const anyFail = shards.some(s => s.data.runStatus && s.data.runStatus !== 'passed');
    if (anyFail) combined.runStatus = 'failed';
  }

  // Prepare output folder
  fs.mkdirSync(opts.out, { recursive: true });
  const assetsRoot = path.join(opts.out, 'assets');
  fs.rmSync(assetsRoot, { recursive: true, force: true });

  for (const s of shards) {
    const src = path.join(s.dir, 'assets');
    if (fs.existsSync(src)) copyDir(src, path.join(assetsRoot, s.label));
  }

  // Render combined HTML using the reporter's own template.
  const { renderHtml } = require(path.resolve(__dirname, '..', 'dist', 'template.js'));
  const outFile = path.join(opts.out, opts.file);
  fs.writeFileSync(outFile, renderHtml(combined), 'utf8');
  fs.writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify(combined), 'utf8');

  const st = combined.stats;
  const rel = path.relative(process.cwd(), outFile);
  console.log(`  merged: ${st.total} tests · ${st.passed} passed · ${st.failed + st.timedOut + st.interrupted} failed · ${st.flaky} flaky · ${st.skipped} skipped`);
  console.log(`  written to ${rel}`);
}

module.exports = { merge, parseArgs };

if (require.main === module) {
  const { dirs, opts } = parseArgs(process.argv.slice(2));
  merge(dirs, opts);
}
