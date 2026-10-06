// npm run test:local — run the examples against the code in this clone instead of the npm release:
// build and pack the repo, install the tarball here without touching package.json, then run Playwright.
// (A tarball, not `npm install ..`: a symlink would load @playwright/test twice.)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

run('npm install', root);
run('npm run build', root);
for (const f of fs.readdirSync(root)) if (/^reporting-labs-.*\.tgz$/.test(f)) fs.unlinkSync(path.join(root, f));
run('npm pack', root);
const tgz = fs.readdirSync(root).find(f => /^reporting-labs-.*\.tgz$/.test(f));
run('npm install', __dirname);
run(`npm install --no-save "${path.join(root, tgz)}"`, __dirname);
const v = require(path.join(__dirname, 'node_modules/reporting-labs/package.json')).version;
console.log(`\n  reporting-labs ${v} from this clone is installed in examples/node_modules\n`);
try { run('npx playwright test ' + process.argv.slice(2).join(' '), __dirname); } catch { process.exitCode = 1; }
