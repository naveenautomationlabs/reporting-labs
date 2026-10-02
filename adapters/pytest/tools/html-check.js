// Loads a rendered report in jsdom, opens every test, and fails on any script error.
// Usage: node html-check.js <index.html>
'use strict';
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = process.argv[2];
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String((e && (e.stack || e.message)) || e)));
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/index.html',
  virtualConsole: vc,
  beforeParse(window) { window.scrollTo = () => {}; window.HTMLElement.prototype.scrollIntoView = () => {}; },
});

setTimeout(() => {
  const w = dom.window;
  const data = JSON.parse(w.document.getElementById('rl-data').textContent);
  let i = 0;
  const next = () => {
    if (i < data.tests.length) {
      w.location.hash = '#t=' + data.tests[i++].id;
      w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      return setTimeout(next, 20);
    }
    const text = w.document.body.textContent;
    const result = { errors, tests: data.tests.length, title: text.includes(data.title), history: (data.history || []).length };
    console.log(JSON.stringify(result));
    process.exit(errors.length ? 1 : 0);
  };
  next();
}, 1000);
