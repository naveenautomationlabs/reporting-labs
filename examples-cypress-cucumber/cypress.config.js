const { defineConfig } = require('cypress');
const createBundler = require('@bahmutov/cypress-esbuild-preprocessor');
const { addCucumberPreprocessorPlugin } = require('@badeball/cypress-cucumber-preprocessor');
const { createEsbuildPlugin } = require('@badeball/cypress-cucumber-preprocessor/esbuild');
const { reportingLabs } = require('reporting-labs/cypress');
const { start } = require('./app/server');

const PORT = 4455;

module.exports = defineConfig({
  video: true,                               // the spec video goes to failed and flaky scenarios in the report
  retries: { runMode: 1, openMode: 0 },      // a scenario that passes on retry shows as flaky
  defaultCommandTimeout: 2000,
  e2e: {
    baseUrl: `http://localhost:${PORT}`,
    specPattern: 'cypress/e2e/**/*.feature',
    async setupNodeEvents(on, config) {
      await start(PORT);                     // the demo app lives as long as Cypress does

      await addCucumberPreprocessorPlugin(on, config);
      on('file:preprocessor', createBundler({ plugins: [createEsbuildPlugin(config)] }));

      // after addCucumberPreprocessorPlugin(): Cypress keeps the last before:run / after:spec / after:run handler,
      // and ours run the preprocessor's too
      reportingLabs(on, config, {
        title: 'Shop — Cypress Cucumber example',
        metadata: { env: 'demo' },
        links: { story: 'https://jira.example.com/browse/{id}' },
      });
      return config;                         // keep this: it switches on the support file
    },
  },
});
