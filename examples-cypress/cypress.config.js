const { defineConfig } = require('cypress');
const { reportingLabs } = require('reporting-labs/cypress');
const { start } = require('./app/server');

const PORT = 4455;

module.exports = defineConfig({
  video: true,                               // the spec video goes to failed and flaky tests in the report
  retries: { runMode: 1, openMode: 0 },      // a test that passes on retry shows as flaky
  defaultCommandTimeout: 2000,
  e2e: {
    baseUrl: `http://localhost:${PORT}`,
    async setupNodeEvents(on, config) {
      await start(PORT);                     // the demo app lives as long as Cypress does

      reportingLabs(on, config, {
        title: 'Shop — Cypress example',
        metadata: { env: 'demo' },
        links: { story: 'https://jira.example.com/browse/{id}' },
      });
      return config;                         // keep this: it switches on the support file
    },
  },
});
