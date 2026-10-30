// Total npm downloads of reporting-labs since its first release, as a shields.io endpoint badge
// (https://shields.io/badges/endpoint-badge). Run daily by .github/workflows/download-badge.yml.
// npm's API serves at most 18 months per request, so the total is added up a year at a time.
import fs from 'node:fs';
import path from 'node:path';

const pkg = process.argv[2] || 'reporting-labs';
const out = process.argv[3] || 'badges/npm-downloads.json';

const day = d => d.toISOString().slice(0, 10);
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.json(); };

const created = new Date((await get(`https://registry.npmjs.org/${pkg}`)).time.created);
let total = 0;
for (let from = new Date(created); from <= new Date(); from.setUTCFullYear(from.getUTCFullYear() + 1)) {
  const to = new Date(from); to.setUTCFullYear(to.getUTCFullYear() + 1); to.setUTCDate(to.getUTCDate() - 1);
  const r = await get(`https://api.npmjs.org/downloads/range/${day(from)}:${day(to)}/${pkg}`);
  total += r.downloads.reduce((a, d) => a + d.downloads, 0);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ schemaVersion: 1, label: 'npm downloads', message: total.toLocaleString('en-US'), color: '1A56DB', cacheSeconds: 3600 }) + '\n');
console.log(`${pkg}: ${total} downloads since ${day(created)} -> ${out}`);
