<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/assets/logo-wordmark.svg" alt="reportingLabs" width="320"></p>

# reportingLabs

**A beautiful test report in one HTML file. It tells you what broke, who owns it, and whether it is new.**

reportingLabs turns a test run into a single HTML file. No server. No upload. No login. Open the file in a browser, attach it to a CI job, or send it on Slack or email. It just works.

Today it ships with a **Playwright** reporter. WebdriverIO, Cypress and Jest/Vitest are on the roadmap.

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/overview.png" alt="Overview page of a reportingLabs report" width="900"></p>

## Quick start (2 minutes)

**1. Install**

```bash
npm i -D reporting-labs
```

**2. Create the config file**

```bash
npx reporting-labs init
```

This creates `reporting-labs.config.ts` next to your `playwright.config.ts`. Every option is in there with a short comment. Most lines are commented out. Uncomment what you want, delete what you do not need.

**3. Add the reporter to `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
import reportingLabs from './reporting-labs.config';

export default defineConfig({
  reporter: [
    ['list'],
    ['reporting-labs', reportingLabs],   // <- add this line
  ],
});
```

Your other reporters (list, html, blob...) keep working as before.

**4. Run tests and open the report**

```bash
npx playwright test
open reporting-labs/index.html
```

Done. Everything below is optional.

> **In a hurry?** Skip the config file and pass options inline: `reporter: [['reporting-labs', { title: 'My app' }]]`.

## Add details to your tests (3 small helpers)

The report already shows steps, screenshots, videos, traces and errors on its own. Three small helpers add the rest. Import them from `reporting-labs` and call them inside a test.

### `meta()`: who owns this test and how important it is

```ts
import { meta } from 'reporting-labs';

test('completes purchase', async ({ page }) => {
  meta({ priority: 'P0', severity: 'blocker', owner: 'naveen', feature: 'payment', epic: 'EPIC-18', story: 'SHOP-250' });
  // ... your test as usual
});
```

One line per test. With this the report can rank failures by priority, group them by owner or feature, and link to your Jira stories.

- Known keys: `priority`, `severity`, `owner`, `feature`, `epic`, `story`, `issue`, `component`, `team`. Any other key you pass is shown too.
- Your Playwright tags like `@sanity` or `@regression` stay as they are and still show on the test.
- To make story and epic keys clickable, set `links` in the config: `links: { story: 'https://yourteam.atlassian.net/browse/{id}' }`.
- `priority`, `severity`, `feature` and `owner` each get a tab in the Breakdown chart and a filter on the Tests page. Want the same for your own key, say `meta({ team: 'web' })`? Add it to `dimensions` in the config: `dimensions: ['priority', 'severity', 'feature', 'owner', 'team']`.

### `log()`: a line in the report

```ts
import { log } from 'reporting-labs';

await log('cart is empty, adding 2 items');
await log('order id', orderId);          // extra values are appended
```

Each line gets a timestamp. Lines with "error" or "fail" show in red, "warn" in amber.

### `testData()`: show the data the test used

```ts
import { testData } from 'reporting-labs';

await testData({ user: 'naveen@x.com', password: 'S3cret' }, 'Login');    // object → key/value block
await testData(rowsFromExcelOrJson, 'Coupons');                           // array of objects → table
await testData(fs.readFileSync('data/users.csv', 'utf8'), 'users.csv');   // CSV text → table
```

**Secrets are masked automatically.** Passwords, tokens, API keys, `Authorization` and `Cookie` headers, JWTs and `Bearer ...` values show as `****`. Add your own keys with `maskKeys: ['otp', 'pan']` in the config.

## API calls: recorded on their own

Nothing to add to your tests. The config file created by `init` starts with `import 'reporting-labs/auto'`, and that is the switch. From then on every call made with Playwright's `request` fixture or `page.request` is recorded as it happens.

```ts
test('creates an order', async ({ request }) => {
  const res = await request.post('/v1/orders', { headers, data });   // recorded, nothing else to do
  expect(res.status()).toBe(201);
});
```

Each call shows in the test detail and in the **API** tab with method, URL, status, time, headers, request body and response body. A **Copy as cURL** button lets you replay it from a terminal. Failed calls (4xx, 5xx, no connection) are highlighted.

If you do not use the config file, add `import 'reporting-labs/auto'` at the top of `playwright.config.ts` instead.

Only calls that do not go through Playwright (Node `fetch`, axios, a Java service) need a manual record:

```ts
import { api } from 'reporting-labs';

await api({ method: 'GET', url, status: res.status, duration, responseBody: await res.json() });
```

## Examples you can copy

The [`examples/`](https://github.com/naveenautomationlabs/reporting-labs/tree/main/examples) folder has one small spec per feature. Read it, run it, copy what you need.

| Spec | What it shows |
|---|---|
| [01-tag-your-tests.spec.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/01-tag-your-tests.spec.ts) | `meta()` with priority, severity, owner, feature, epic, story |
| [02-logs-and-test-data.spec.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/02-logs-and-test-data.spec.ts) | `log()` lines and `testData()` as key/value, table and CSV, with secrets masked |
| [03-api-calls.spec.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/03-api-calls.spec.ts) | Plain `request.post` / `patch` / `delete` and `page.request` calls to the public [gorest.in](https://gorest.in/) API, recorded on their own; a 403; `api()` for other clients |
| [04-steps-and-attachments.spec.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/04-steps-and-attachments.spec.ts) | `test.step()` bars, screenshot and JSON attachments, visual comparison viewer |
| [05-outcomes.spec.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/05-outcomes.spec.ts) | skip with a reason, fixme, expected failure, timeout, a plain failure, a flaky test |
| [06-bdd-style.spec.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/06-bdd-style.spec.ts) | Given / When / Then steps shown as Gherkin |
| [reporting-labs.config.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/reporting-labs.config.ts) | A complete config with comments |
| [playwright.config.ts](https://github.com/naveenautomationlabs/reporting-labs/blob/main/examples/playwright.config.ts) | How the reporter sits next to the built-in reporters |

```bash
git clone https://github.com/naveenautomationlabs/reporting-labs
cd reporting-labs/examples && npm install && npx playwright test
open reporting-labs/index.html
```

Run it two or three times to see the history features (new vs known failures, flaky dots, got slower, trend).

## A tour of the report

### Overview: the whole run on one screen

- **Tiles**: pass rate with a ring and the change from the last run, then passed / failed / flaky / skipped. Click a tile to see those tests.
- **Run strip**: every test as one small cell, in run order. Hover for the name, click to open.
- **Needs attention**: failures sorted by priority and severity, with the spec file, the owner, and whether the failure is new or has been failing for a while.
- **Failure clusters**: failures grouped by error message. 30 red tests with one cause read as one problem.
- **Breakdown**: bars per priority, severity, feature, owner, spec file, project or tag. Click a row to filter the test list. With more than one project you also get a feature × project heatmap.
- **Slowest tests**, **Got slower** (2× slower than last run), **Flakiest tests**, **Skipped** (with reasons), **Environment** and the **Trend** across runs.

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/heatmap.png" alt="Breakdown card with the feature by project heatmap" width="900"></p>

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/trend.png" alt="Trend chart with hover tooltip" width="900"></p>

### Failures: everything you need to triage

- **Bug report** button on every failed test: a ready-to-paste ticket with priority, owner, story, environment, test data, steps to reproduce (taken from the test's own steps, the failing one marked), expected vs actual, the error, API calls and attachment names. Pick Markdown, Jira or plain text, edit if you like, copy or download.
- **By owner**: who to ping, with failed and flaky counts. Click an owner to filter.
- **Download CSV / JSON**: all failed and flaky tests with title, spec, project, priority, owner, ticket, attempts, duration, first error line and new/known status. Ready for Jira or a sheet.
- **Copy summary**: a Slack or Teams message with the top failures, owners and ticket keys.
- The table shows every failed or flaky test with its last runs as dots.

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/failures.png" alt="Failures page" width="900"></p>

### Test detail: the error, the steps, the proof

- **What went wrong, in plain words.** Above every error the report says what happened and what to check first: "Element not found: `#checkout` was not on the page within 5s", "Element covered by another element: a `<div class=overlay>` was on top", "Site unreachable", "Test timed out", "Assertion failed: expected "90", got "100"". Playwright's own message stays right below it, untouched. The same label shows in Needs attention and groups the Failure clusters.
- **Expected vs received** side by side with the difference highlighted.
- Error **location** (opens in VS Code), Playwright's **code snippet**, full message and stack.
- **Steps** with a bar per step showing its share of the test time. Given/When/Then titles are styled as Gherkin.
- Retries as tabs. Screenshots inline (click to zoom), videos, traces, console output, logs, test data and API calls.

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/test-detail.png" alt="Test detail with expected vs received diff and step bars" width="900"></p>

### Timeline: how the run used its workers

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/timeline.png" alt="Timeline by worker" width="900"></p>

## Run history: new vs known, flaky, slower

The reporter keeps a small file, `reporting-labs.history.json`, next to your config. It remembers the last 30 runs. Commit it, or cache it in CI, and the report starts answering the questions you ask first:

| Question | Where it shows |
|---|---|
| Did this break just now, or has it been red for days? | `new this run` or `failing since #1838` on every failure |
| Which tests are flaky? | Last-10-runs dots on every failure, plus the Flakiest tests card |
| What got slower? | Got slower tab on the Slowest card |
| Are we getting better or worse? | Trend chart with pass rate, fail rate and duration per run |

The first run has nothing to compare with. These cards fill in from the second run.

## Screenshots, videos, traces

Nothing extra to do. Use Playwright's own settings and the report picks them up:

```ts
use: {
  screenshot: 'only-on-failure',   // shown inline, click to zoom
  video: 'retain-on-failure',      // inline player
  trace: 'on-first-retry',         // trace card with download and how to open it
}
```

`toHaveScreenshot` failures get a visual comparison viewer: slider, side by side, and diff. Anything you attach with `test.info().attach()` shows up too: images inline, JSON and CSV as a table or key/value block, text as a code block, everything else as a download.

## What the report covers

Every outcome Playwright can produce, not just pass and fail:

- passed, failed, flaky (passed on retry), skipped with the `test.skip` / `test.fixme` reason, timed out, interrupted
- `test.fail()` tests that fail as expected count as passed with an "Expected failure" badge
- errors outside tests (a spec that throws at load, global setup, a worker crash) get their own card at the top
- interrupted runs show a banner with how many tests did not finish
- the Environment card shows Playwright and Node versions, OS, browsers, workers, shard, the CI job link and the git commit

## How it compares

Legend: ✅ built in · 🟡 possible with manual setup or extra config · ❌ not in the official docs

| Feature | Playwright HTML | Allure | reportingLabs |
|---|:---:|:---:|:---:|
| Single HTML file, opens without a server | ❌ folder, served by `show-report` | 🟡 single-file mode (2.24+, Allure 3 plugin), otherwise `allure open` | ✅ |
| No extra tooling | ✅ | ❌ CLI needed; Allure 2 needs Java | ✅ npm package only |
| Setup | ✅ built in | 🟡 reporter + generate step | ✅ one line in `reporter:` |
| Steps, screenshots, videos, traces | ✅ | ✅ | ✅ |
| Visual comparison viewer (slider, side by side, diff) | ❌ | ❌ | ✅ |
| Tags and annotations shown | ✅ | ✅ labels via runtime API | ✅ `meta()` + tags |
| Priority / severity / owner / feature / epic / story | 🟡 custom annotations | ✅ labels | ✅ |
| Links to Jira, TMS | 🟡 annotation with a URL | ✅ `issue()`, `tms()` | ✅ `links` templates |
| Failures ranked by priority and severity | ❌ | ❌ | ✅ Needs attention |
| Failures by owner | ❌ | 🟡 owner label, no rollup documented | ✅ |
| History across runs | ❌ | 🟡 History Trend when historical data is accumulated | ✅ history file, zero setup |
| New vs known failures ("failing since #1840") | ❌ | ❌ | ✅ |
| Flaky detection | ✅ `flaky` outcome per run | 🟡 `@Flaky` annotation (Java) | ✅ outcome + flakiest over last runs |
| Got slower vs last run | ❌ | ❌ | ✅ |
| Trend chart | ❌ | ✅ | ✅ |
| Failures grouped by root cause | ❌ | 🟡 `categories.json` with regex | ✅ automatic clusters |
| Failures explained in plain words | ❌ | ❌ | ✅ 18 kinds |
| Bug report in one click | ❌ | ❌ | ✅ Markdown, Jira, text |
| Environment info | ❌ | 🟡 `environment.properties` | ✅ automatic + `env` option |
| API calls with request/response | ❌ | 🟡 manual attachments | ✅ automatic, Copy as cURL |
| Logs and test data blocks | 🟡 attachments | 🟡 attachments, parameters | ✅ `log()`, `testData()` |
| Secrets masked | ❌ | 🟡 parameter masking | ✅ automatic |
| CSV / JSON export of failures, Slack summary | ❌ | ❌ | ✅ |
| Timeline by worker | ❌ | ✅ | ✅ |
| Combine shards / several runs | ✅ blob + `merge-reports` | ✅ Launches | ❌ on the roadmap |
| Frameworks beyond Playwright | ❌ | ✅ many languages | ❌ on the roadmap |
| Free and open source | ✅ | ✅ (Allure TestOps is a separate paid product) | ✅ MIT |

Based on the official docs as of September 2026. ❌ means the feature is not described in the tool's documentation, not that it is impossible. Sources: Playwright [reporters](https://github.com/microsoft/playwright/blob/main/docs/src/test-reporters-js.md), [annotations](https://github.com/microsoft/playwright/blob/main/docs/src/test-annotations-js.md), [retries](https://github.com/microsoft/playwright/blob/main/docs/src/test-retries-js.md), [sharding](https://github.com/microsoft/playwright/blob/main/docs/src/test-sharding-js.md), [trace viewer](https://github.com/microsoft/playwright/blob/main/docs/src/trace-viewer-intro-js.md); Allure [allure-playwright](https://github.com/allure-framework/allure-js/blob/main/packages/allure-playwright/README.md), [Allure 3](https://github.com/allure-framework/allure3), [Allure 2.24.0 release](https://github.com/allure-framework/allure2/releases/tag/2.24.0), [Allure docs: command line](https://github.com/allure-framework/allure-docs/blob/main/content/reporting/commandline.md), [features](https://github.com/allure-framework/allure-docs/blob/main/content/gettingstarted/features.md), [report structure](https://github.com/allure-framework/allure-docs/blob/main/content/gettingstarted/report-structure.md). If something here is out of date, open an issue and it will be fixed.

## All options

Every option is optional. `npx reporting-labs init` writes them all, with comments, into `reporting-labs.config.ts` (`--js` for JavaScript, `--force` to overwrite).

| Option | Default | What it does |
|---|---|---|
| `title` | `'Test report'` | Title in the header |
| `logo` | – | Your logo next to the title: `'logo.png'` (a file next to the config, embedded in the report) or an https URL |
| `project` | – | `{ name, version, team, url }` shown under the title |
| `metadata` | `{}` | Chips in the header, e.g. `{ env: 'staging', build: '#1842' }`. `build` labels the run in the trend; in CI the run number is used when it is not set |
| `env` | – | Extra rows on the Environment card |
| `links` | `{}` | Turn meta keys into links. `{id}` is replaced by the value |
| `maskKeys` | `[]` | Extra keys to mask as `****` |
| `dimensions` | `['priority','severity','feature','owner']` | Which `meta()` keys get a tab in the Breakdown chart and a dropdown filter on the Tests page. Add your own key, e.g. `'team'`, to get a chart for it |
| `dimensionOrder` | P0…P4, blocker…trivial | The order values appear in those charts and filters. Only needed for your own values, e.g. `{ severity: ['high','medium','low'] }` |
| `widgets` | all on | Hide cards: `{ tags: false, timeline: false, ... }`. Failure clusters and the Trend chart are always shown |
| `sections` | `[]` | Extra HTML below the summary, e.g. release notes |
| `history` | `{ enabled: true, keep: 30 }` | Run history file; `file` sets a custom path |
| `palette` | `'lab'` | `'lab'` (blue), `'ocean'`, `'ember'`, `'mono'` |
| `accent` | palette accent | Your brand color |
| `theme` | `'auto'` | `'light'`, `'dark'` or follow the OS |
| `customCss` | `''` | CSS appended to the report |
| `editorLinks` | on locally, off in CI | "Open in VS Code" links |
| `bdd` | auto | Style Given/When/Then steps as Gherkin |
| `outputFolder` | `'reporting-labs'` | Where the report goes |
| `outputFile` | `'index.html'` | Report file name |
| `embedAttachments` | `true` | Screenshots inside the HTML (one file) |
| `embedLimit` | 2 MB | Bigger attachments are copied to `./assets` |
| `embedVideos` | `false` | Videos inside the HTML too (bigger file, no folder issues) |
| `embedFonts` | `true` | Bundle the fonts (~140 KB) so it looks the same offline |
| `announce` | `true` | Print the report path after the run |

If your reporter list differs between CI and local, add the same line to both:

```ts
reporter: process.env.CI
  ? [['blob'], ['reporting-labs', reportingLabs]]
  : [['list'], ['reporting-labs', reportingLabs]],
```

## Running in CI

The report is a plain file written next to your tests. It works anywhere `npx playwright test` runs: GitHub Actions, GitLab, Jenkins, CircleCI, Azure Pipelines, Bitbucket, your laptop. Nothing is sent anywhere and no fonts are fetched, so it also works on locked-down networks.

What happens on its own in CI:

- The Environment card links the CI job and the commit.
- The run is labelled with the CI run number in the history and the trend, unless you set `metadata.build`.
- "Open in VS Code" links are off, because they would point at the runner's paths.

Two things to set up:

1. **Publish the report.** Upload the `reporting-labs/` folder as a build artifact (or archive it in Jenkins). Videos and large files sit in `reporting-labs/assets/`, so keep the folder together.
2. **Keep the history.** `reporting-labs.history.json` powers the trend and the new vs known failures. On GitHub Actions save it with `actions/cache`. On Jenkins the workspace usually keeps it on its own.

Ready-to-copy samples: [docs/ci/github-actions.yml](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/github-actions.yml) and [docs/ci/Jenkinsfile](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/Jenkinsfile).

```yaml
# GitHub Actions, the two steps that matter
- uses: actions/cache@v4
  with:
    path: reporting-labs.history.json
    key: reporting-labs-history-${{ github.ref_name }}-${{ github.run_id }}
    restore-keys: reporting-labs-history-${{ github.ref_name }}-
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: test-report
    path: reporting-labs/
```

**Jenkins note.** Jenkins blocks inline JavaScript by default, so a single-file report shows up blank inside the Jenkins HTML Publisher (Playwright's own HTML report has the same issue). Download the archived artifact and open it locally, or ask an admin to relax the policy in the script console: `System.setProperty("hudson.model.DirectoryBrowserSupport.CSP", "")`.

## Good to know

- **One file.** Screenshots and fonts are inside `index.html`, so it works from an email or a CI artifact. Videos and large files go to `./assets` next to it. Keep the folder together when you share it.
- **Each run replaces the report.** The old report stays until the new run finishes. Archive the folder if you want to keep an old one.
- **Videos on macOS.** If the report is in Downloads, Desktop or Documents and you open it as a file, Chrome may not be allowed to read the `assets/` folder (the player shows a clear message). Allow Chrome under System Settings → Privacy & Security → Files and Folders, move the project elsewhere, or set `embedVideos: true`.
- **Keyboard.** `j` / `k` next and previous test, `f` failed only, `/` search, `1`–`5` switch views, `Esc` close.
- **Print.** A print stylesheet is included, so "Save as PDF" works.
- **Themes.** Light and dark follow the OS. The toggle in the header remembers your choice.

## Roadmap

- WebdriverIO, Cypress, Jest/Vitest and JUnit XML adapters
- AI summary of failures (bring your own API key)
- Hosted history dashboard across branches and projects

## License

MIT © Naveen Automation Labs
