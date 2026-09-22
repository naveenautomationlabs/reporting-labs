#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const cmd = args[0];
const has = f => args.includes(f);

if (cmd === 'merge') {
  const { merge, parseArgs } = require('./merge');
  const { dirs, opts } = parseArgs(args.slice(1));
  merge(dirs, opts);
} else if (cmd === 'init') {
  const js = has('--js');
  const file = path.resolve(js ? 'reporting-labs.config.js' : 'reporting-labs.config.ts');
  if (fs.existsSync(file) && !has('--force')) {
    console.log(`${path.basename(file)} already exists. Use --force to overwrite it.`);
    process.exit(1);
  }
  let template = fs.readFileSync(path.join(__dirname, 'config-template.txt'), 'utf8');
  if (js) {
    template = template
      .replace("import 'reporting-labs/auto';", "require('reporting-labs/auto');")
      .replace("import type { ReportingLabsOptions } from 'reporting-labs';\n", '')
      .replace('const config: ReportingLabsOptions = {', "/** @type {import('reporting-labs').ReportingLabsOptions} */\nconst config = {")
      .replace('export default config;', 'module.exports = config;');
  }
  fs.writeFileSync(file, template);
  const base = path.basename(file, path.extname(file));
  console.log(`Created ${path.basename(file)} with every option listed. Uncomment what you need.`);
  console.log('');
  console.log(`Now in playwright.config.${js ? 'js' : 'ts'}:`);
  if (js) {
    console.log(`  const reportingLabs = require('./${base}');`);
  } else {
    console.log(`  import reportingLabs from './${base}';`);
  }
  console.log("  reporter: [['list'], ['reporting-labs', reportingLabs]],");
} else {
  console.log(`reporting-labs

  npx reporting-labs init            write reporting-labs.config.ts with every option, commented
  npx reporting-labs init --js       same, as reporting-labs.config.js
  npx reporting-labs init --force    overwrite an existing config file
  npx reporting-labs merge <dirs>    combine several shard runs into one report (see 'merge --help')

Then in playwright.config.ts:
  import reportingLabs from './reporting-labs.config';
  reporter: [['list'], ['reporting-labs', reportingLabs]],
`);
}
