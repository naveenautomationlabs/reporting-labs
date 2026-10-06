# Examples

Small, self-contained spec files that show every reportingLabs feature. They use `page.setContent()` and `page.route()` instead of a real website, so they run anywhere in a few seconds. Only `03-api-calls` goes online: it talks to the free public API at [gorest.in](https://gorest.in/).

| File | Shows |
|---|---|
| [01-tag-your-tests.spec.ts](01-tag-your-tests.spec.ts) | `meta()` with priority, severity, owner, feature, epic, story |
| [02-logs-and-test-data.spec.ts](02-logs-and-test-data.spec.ts) | `log()` lines, `testData()` as key/value, table and CSV; secrets masked |
| [03-api-calls.spec.ts](03-api-calls.spec.ts) | Plain `request.post` / `patch` / `delete` and `page.request` calls against gorest.in, recorded automatically; a 403; `api()` for other clients |
| [04-steps-and-attachments.spec.ts](04-steps-and-attachments.spec.ts) | `test.step()` bars, screenshots, JSON and text attachments, visual comparison |
| [05-outcomes.spec.ts](05-outcomes.spec.ts) | skip with a reason, fixme, expected failure (`test.fail`), timeout, retries |
| [06-bdd-style.spec.ts](06-bdd-style.spec.ts) | Given / When / Then steps rendered as Gherkin |
| [reporting-labs.config.ts](reporting-labs.config.ts) | A complete reporter config with comments |
| [playwright.config.ts](playwright.config.ts) | How the reporter is wired in, next to the built-in reporters |

## Run them

```bash
git clone https://github.com/naveenautomationlabs/reporting-labs
cd reporting-labs/examples
npm install
npx playwright test
open reporting-labs/index.html
```

Run the suite two or three times to see the history features (new vs known failures, flaky dots, got slower, trend).

### Trying a change that is not on npm yet

One command does all of it: `npm run test:local` (builds, packs and installs this clone, then runs the tests). The steps it runs:

`npm install` above pulls the published `reporting-labs` from npm. To run the examples against the code in this clone, build and pack it first, then install the tarball into `examples/` without touching its package.json:

```bash
cd reporting-labs
npm install && npm run build && npm pack          # writes reporting-labs-<version>.tgz
cd examples
npm install
npm install --no-save ../reporting-labs-*.tgz
npx playwright test
```

Do not use `npm link` or `npm install ..` here: a symlinked package resolves `@playwright/test` from the repo root, Playwright then sees two copies and fails with "did not expect test.beforeAll() to be called here".
