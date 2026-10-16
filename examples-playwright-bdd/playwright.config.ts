import 'reporting-labs/auto';   // every request / page.request call goes to the report's API tab
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// playwright-bdd turns the feature files into Playwright tests: playwright.config.ts, fixtures, projects, retries
// and every reporter keep working. missingSteps: a step with no definition fails its scenario instead of the build.
const testDir = defineBddConfig({ features: 'features/**/*.feature', steps: 'steps/**/*.ts', missingSteps: 'fail-on-run' });

export default defineConfig({
  testDir,
  retries: 1,                      // a scenario that passes on retry shows as flaky
  reporter: [
    ['list'],
    ['reporting-labs', { title: 'Shop — Playwright BDD example', metadata: { env: 'demo' }, links: { story: 'https://jira.example.com/browse/{id}' } }],
  ],
  use: { baseURL: 'http://localhost:4466', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'node app/server.js', url: 'http://localhost:4466/login', reuseExistingServer: true },
});
