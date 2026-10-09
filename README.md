<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/assets/logo-wordmark.svg" alt="reportingLabs" width="320"></p>

<p align="center">
  <a href="https://www.npmjs.com/package/reporting-labs"><img src="https://img.shields.io/npm/v/reporting-labs.svg?label=npm" alt="npm"></a>
  <a href="https://reportinglabs.dev"><img src="https://img.shields.io/badge/docs-reportinglabs.dev-1A56DB.svg" alt="Docs"></a>
  <a href="https://reportinglabs.dev/support"><img src="https://img.shields.io/badge/%E2%99%A5%20Support-reportingLabs-E5405E?style=flat" alt="Support reportingLabs"></a>
</p>

# reportingLabs

**A beautiful test report in one HTML file. It tells you what broke, who owns it, and whether it is new.**

reportingLabs turns a test run into a single HTML file. No server. No upload. No login. Open the file in a browser, attach it to a CI job, or send it on Slack or email. It just works.

Today it ships with a **Playwright** reporter, a **WebdriverIO** reporter and a **Cypress** plugin. Jest/Vitest is on the roadmap. The same report is also available for [Java](https://github.com/naveenautomationlabs/reporting-labs-java) and [Python](https://github.com/naveenautomationlabs/reporting-labs-python).

> ♥ **Free and open source, no paid tier.** If reportingLabs saves your team time, [support its development](https://reportinglabs.dev/support) (Razorpay for India, Stripe for everywhere else). A ⭐ on GitHub helps too.

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/quickstart.gif" alt="reportingLabs in three steps: install, tag your tests, open one HTML file" width="900"></p>

<p align="center"><em>Install, tag your tests, open one HTML file.</em></p>

<p align="center"><img src="https://raw.githubusercontent.com/naveenautomationlabs/reporting-labs/main/docs/overview.png" alt="Overview page of a reportingLabs report" width="900"></p>

## Quick start (2 minutes)

**1. Install**

```bash
npm i -D reporting-labs@latest
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
```

The report opens in your browser when something failed (`open: 'always'` to open every time, `'never'` to stay quiet). It is at `reporting-labs/index.html`.

Done. Everything below is optional.

> **In a hurry?** Skip the config file and pass options inline: `reporter: [['reporting-labs', { title: 'My app' }]]`.

## See everything the report can do

Every card and tab is switched on. What you see depends on what your tests give it:

1. **Add `meta()` to your tests** and the report ranks failures by priority, groups them by owner and feature, and links to your stories. See [the helpers](#add-details-to-your-tests-3-small-helpers).
2. **Run the suite twice** and the Trend chart, "new vs known" failures, flaky dots and "Got slower" appear. History is kept in `reporting-labs.history.json`.
3. **Turn on Playwright's `screenshot`, `video` and `trace`** in `playwright.config.ts` and they show up on every failed test.
4. **Have more than one Playwright project** (say chromium and webkit) and you get a feature × project heatmap.

The report tells you about these itself: a card that has nothing to show yet explains what to do.

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
- To make story and epic keys clickable, set `links` in the config: `links: { story: 'https://yourteam.atlassian.net/browse/{id}' }`. Several ids (`story: ['SHOP-1', 'SHOP-2']`) become one link each.
- A link whose URL needs more than the shown value (a workspace, a project, an organisation) takes an object. Any tool, any URL shape: every `{placeholder}` in `url` is filled from the object you pass in `meta()`, `display` is what the report shows (default `{id}`), the other fields only build the URL. ALM Octane / ValueEdge as an example:

  ```ts
  // reporting-labs.config.ts
  links: {
    octaneTestCase: {
      url: 'https://oss.valueedge.com/ui/?p={p}#/entity-navigation?entityType=test&id={id}',
      display: '{id}',
    },
  },
  ```

  ```ts
  // tests/notifications.spec.ts
  test('TC003 - manual trigger with all notifications disabled', async ({ page }) => {
    meta({ priority: 'P1', owner: 'chetan', octaneTestCase: { id: '58966', p: '4001/14014' } });
    // ... your test as usual
  });
  ```

  The test shows a chip **octaneTestCase 58966**; clicking it opens the full URL. `p` never appears in the report and can differ per test. The same shape covers Azure DevOps (`url: 'https://dev.azure.com/{org}/{project}/_workitems/edit/{id}', display: 'AB#{id}'`) or any in-house tool. Jira, TestRail, Xray and Zephyr need only the plain `{id}` string.
- Forgot one? After every run the console lists the tests that have no `meta()`, with file and line. Turn it off with `warnMissingMeta: false`.
- `priority`, `severity`, `feature` and `owner` each get a tab in the Breakdown chart and a filter on the Tests page. Want the same for your own key, say `meta({ team: 'web' })`? Add it to `dimensions` in the config: `dimensions: ['priority', 'severity', 'feature', 'owner', 'team']`.

### Or write it as a comment (your choice)

There are **two ways** to add meta. Both give **exactly the same report**, so use whichever you like:

| | Way 1: `meta()` | Way 2: a comment |
|---|---|---|
| Where | one line inside the test | a comment right above the test |
| Import needed | yes | no |

```ts
// Way 1: meta() in the test
test('completes purchase', async ({ page }) => {
  meta({ priority: 'P0', owner: 'naveen', feature: 'payment', story: 'SHOP-250' });
  // ... your test as usual
});

// Way 2: a comment above the test, no import, no code change
/**
 * @priority P0  @owner naveen  @feature payment  @story SHOP-250
 * @smoke
 */
test('completes purchase', async ({ page }) => {
  // ... your test as usual
});
```

- **Already using `meta()`?** Nothing changes. Comments are only an extra option.
- **Mix them freely.** Some tests with `meta()`, others with a comment. If one test has both, `meta()` wins.
- **For a whole group:** a comment above `test.describe` applies to every test inside it.
- **Tags:** a line with only `@words` (`@smoke @regression`) becomes tags. `@P0` sets the priority, `@critical` the severity.
- **Your old comments are safe.** A comment with an empty line before the test, a name in a sentence ("reported by @naveen"), unknown keys and JSDoc tags like `@param` are all ignored.
- **WebdriverIO** and **Cypress** read them too, above `it()` and `describe()`.
- Turn it off with `commentMeta: false`.

**Don't type it by hand: install the snippets.** In VS Code:

1. In the project folder, run `npx reporting-labs snippets` (`npx reporting-labs init` already does this). It creates `.vscode/reporting-labs.code-snippets`.
2. In a test file, type `rlmeta` and press **Tab**. The comment appears; pick the priority from the list, then **Tab** to the next field.
3. Commit the `.vscode` file so the whole team gets the snippets.

Also there: `rltest` (comment + `test()`), `rlit` (comment + `it()`), `rldescribe` (a `describe` with the comment). For IntelliJ / WebStorm and Eclipse, see [Install the editor snippets](https://reportinglabs.dev/features/meta-comments#install-the-editor-snippets).

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

### Secrets are masked automatically

Passwords, tokens and card numbers never reach the report. They are replaced with `****` **before** anything is written, with no setup.

**Where:** `console.log` output, `log()` lines, `testData()` blocks, API headers and bodies, step titles and failed assertions (a failing `expect(token)` shows `Received: "****"`).

**What it catches:**

| Kind | Examples |
|---|---|
| Key and value | `password=x`, `Password: x`, `{ password: 'x' }`, `"password":"x"`, `access_token=x`, `X-Api-Key: x` |
| Plain sentences | "password is x", "with password S3cret@1", "password for user X is Y", "Typed x into password field" |
| Login in a URL or command | `user:pass@host`, `curl -u user:pass`, `credentials user:pass` |
| Auth headers | `Bearer …`, `Basic …` |
| Tokens | JWTs, and GitHub, AWS, Slack, Stripe, Google, GitLab, npm and SendGrid keys |
| Card numbers | any valid card number (Luhn check) |

**It remembers.** Once a value has been masked, it is masked everywhere it shows up later, even with no key around it: `Logging in as admin / s3cret` becomes `Logging in as admin / ****`. It also learns the values of environment variables like `PASSWORD`, `API_TOKEN` or `*_SECRET`.

**Add your own:**

```ts
reporter: [['reporting-labs', {
  maskKeys: ['otp', 'pan'],               // extra key names to mask
  maskValues: [process.env.PASSWORD],     // exact values to mask wherever they appear
  // maskFromEnv: false,                  // stop learning values from environment variables
}]]
```

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

For Cypress, [`examples-cypress/`](https://github.com/naveenautomationlabs/reporting-labs/tree/main/examples-cypress) is a tiny offline shop app with a few specs (steps, API calls, a flaky test, a failing hook): `cd examples-cypress && npm install && npx cypress run`.

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

✅ built in  ·  🟡 possible with extra setup  ·  ❌ not in the official docs

| | Playwright HTML | Allure | **reportingLabs** |
|---|:---:|:---:|:---:|
| **Getting started** | | | |
| Single HTML file, opens without a server | ❌<br><sub>a folder, served by `show-report`</sub> | 🟡<br><sub>single-file mode (2.24+, Allure 3)</sub> | ✅ |
| Nothing extra to install | ✅ | ❌<br><sub>Allure CLI; Allure 2 needs Java</sub> | ✅<br><sub>one package</sub> |
| Setup | ✅<br><sub>built in</sub> | 🟡<br><sub>reporter + generate step</sub> | ✅<br><sub>one line</sub> |
| Frameworks | ❌<br><sub>Playwright only</sub> | ✅<br><sub>many languages</sub> | ✅<br><sub>Playwright, Cypress, WebdriverIO, pytest, pytest-bdd, Robot, JUnit 5, TestNG, Cucumber</sub> |
| **Each test** | | | |
| Steps, screenshots, videos, traces | ✅ | ✅ | ✅ |
| Logs and test data | 🟡<br><sub>as attachments</sub> | 🟡<br><sub>attachments, parameters</sub> | ✅<br><sub>`log()`, `testData()`</sub> |
| API calls with request and response | ❌ | 🟡<br><sub>manual attachments</sub> | ✅<br><sub>automatic, Copy as cURL</sub> |
| Environment info | ❌ | 🟡<br><sub>`environment.properties`</sub> | ✅<br><sub>automatic</sub> |
| Secrets masked | ❌ | 🟡<br><sub>parameters only</sub> | ✅<br><sub>automatic</sub> |
| **Failures** | | | |
| Ranked by priority and severity | ❌ | ❌ | ✅<br><sub>Needs attention</sub> |
| Grouped by root cause | ❌ | 🟡<br><sub>regex in `categories.json`</sub> | ✅<br><sub>automatic clusters</sub> |
| Explained in plain words | ❌ | ❌ | ✅<br><sub>19 kinds</sub> |
| New vs already failing | ❌ | ❌ | ✅<br><sub>"failing since #1840"</sub> |
| Grouped by owner | ❌ | 🟡<br><sub>owner label, no rollup</sub> | ✅ |
| Bug report in one click | ❌ | ❌ | ✅<br><sub>Markdown, Jira, text</sub> |
| **Across runs** | | | |
| History and trend chart | ❌ | 🟡<br><sub>when history is carried over</sub> | ✅<br><sub>zero setup</sub> |
| Flaky tests | ✅<br><sub>per run</sub> | 🟡<br><sub>`@Flaky` (Java)</sub> | ✅<br><sub>plus flakiest over runs</sub> |
| Got slower than last run | ❌ | ❌ | ✅ |
| Timeline by worker | ❌ | ✅ | ✅ |
| **Organise and share** | | | |
| Priority, owner, feature, story | 🟡<br><sub>custom annotations</sub> | ✅<br><sub>labels</sub> | ✅<br><sub>`meta()` or a comment</sub> |
| Links to Jira or a TMS | 🟡<br><sub>URL in an annotation</sub> | ✅<br><sub>`issue()`, `tms()`</sub> | ✅<br><sub>`links` templates</sub> |
| Merge shards or several runs | ✅<br><sub>`merge-reports`</sub> | ✅<br><sub>launches</sub> | ✅<br><sub>`reporting-labs merge`</sub> |
| PDF of the report | ❌ | ❌ | ✅<br><sub>`report.pdf`</sub> |
| CSV / JSON export, Slack summary | ❌ | 🟡<br><sub>Allure 3 plugins</sub> | ✅ |
| Free and open source | ✅ | ✅<br><sub>TestOps is paid</sub> | ✅<br><sub>MIT</sub> |

Based on the official docs as of September 2026. ❌ means the feature is not described in the tool's documentation, not that it is impossible. Sources: Playwright [reporters](https://github.com/microsoft/playwright/blob/main/docs/src/test-reporters-js.md), [annotations](https://github.com/microsoft/playwright/blob/main/docs/src/test-annotations-js.md), [retries](https://github.com/microsoft/playwright/blob/main/docs/src/test-retries-js.md), [sharding](https://github.com/microsoft/playwright/blob/main/docs/src/test-sharding-js.md), [trace viewer](https://github.com/microsoft/playwright/blob/main/docs/src/trace-viewer-intro-js.md); Allure [allure-playwright](https://github.com/allure-framework/allure-js/blob/main/packages/allure-playwright/README.md), [Allure 3](https://github.com/allure-framework/allure3), [Allure 2.24.0 release](https://github.com/allure-framework/allure2/releases/tag/2.24.0), [Allure docs: command line](https://github.com/allure-framework/allure-docs/blob/main/content/reporting/commandline.md), [features](https://github.com/allure-framework/allure-docs/blob/main/content/gettingstarted/features.md), [report structure](https://github.com/allure-framework/allure-docs/blob/main/content/gettingstarted/report-structure.md). If something here is out of date, open an issue and it will be fixed.

## All options

Every option is optional. `npx reporting-labs init` writes them all, with comments, into `reporting-labs.config.ts` (`--js` for JavaScript, `--force` to overwrite).

| Option | Default | What it does |
|---|---|---|
| `title` | `'Test report'` | Title in the header |
| `logo` | – | Your logo next to the title: `'logo.png'` (a file next to the config, embedded in the report) or an https URL |
| `project` | – | `{ name, version, team, url }` shown under the title |
| `metadata` | `{}` | Chips in the header, e.g. `{ env: 'staging', build: '#1842' }`. `build` labels the run in the trend; in CI the run number is used when it is not set. The environment name is also read from the process environment and wins over `env` here: `ENV`, `TEST_ENV`, `APP_ENV`, `TARGET_ENV` and friends, or any variable ending in `_ENV` / `_ENVIRONMENT` (`OPENCART_ENV`), so a config that says `local` still labels CI reports `dev`, `qa`, `stage` |
| `envVar` | – | Name of the variable that holds the environment name, when the detection cannot guess it |
| `env` | – | Extra rows on the Environment card |
| `links` | `{}` | Turn meta keys into links. `{id}` is replaced by the value. An object `{ url, display }` builds the URL from several fields of an object passed to `meta()`, see below |
| `maskKeys` | `[]` | Extra keys to mask as `****` |
| `maskValues` | `[]` | Literal values to blank wherever they appear, keyed or not |
| `maskFromEnv` | `true` | Learn the values of sensitive-looking environment variables (`PASSWORD`, `API_TOKEN`) and blank them everywhere |
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
| `expandFailedSteps` | `true` | Open the steps that lead to a failure. `false`: every step with sub-steps starts collapsed (also on failures); **Expand all / Collapse all** above the steps either way |
| `bdd` | auto | Style Given/When/Then steps as Gherkin |
| `outputFolder` | `'reporting-labs'` | Where the report goes |
| `outputFile` | `'index.html'` | Report file name |
| `embedAttachments` | `true` | Screenshots inside the HTML (one file) |
| `embedLimit` | 2 MB | Bigger attachments are copied to `./assets` |
| `embedVideos` | `false` | Videos inside the HTML too (bigger file, no folder issues) |
| `emitJson` | `true` | Also write `report.json` alongside `index.html` (used by `merge`) |
| `jsonFile` | `'report.json'` | File name of the JSON blob |
| `pdf` | `true` | Also write `report.pdf` (light theme, print-ready), printed by Playwright's Chromium or an installed Chrome / Edge, whatever browser the tests ran on. `false` turns it off; `{ file: 'run.pdf' }` renames it; `{ chromePath }` (or `CHROME_PATH`) names the browser. The Export PDF button in the report works either way |
| `embedFonts` | `true` | Bundle the fonts (~140 KB) so it looks the same offline |
| `announce` | `true` | Print the report path after the run |
| `open` | `'on-failure'` | Open the report in the browser after the run: `'on-failure'`, `'always'` or `'never'`. Never opens in CI |
| `commentMeta` | `true` | Also read meta from the comment above a test or `describe` (`/** @priority P0 @owner naveen */`). `meta()` wins when both are there. `false` reads no comments |
| `warnMissingMeta` | `true` | After the run, list the tests that have no meta (no `meta()` and no comment) in the console, so nobody on the team forgets |

**Runtime overrides.** `REPORTING_LABS_METADATA_<KEY>` sets a header chip from the environment (`REPORTING_LABS_METADATA_ENV=qa`, `REPORTING_LABS_METADATA_RELEASE=2.3`) and `REPORTING_LABS_TITLE`, `_THEME`, `_PALETTE`, `_ACCENT`, `_LOGO`, `_OUTPUT_FOLDER` the matching option; they win over the config. The env chip resolves in this order: `REPORTING_LABS_METADATA_ENV`, the variable `envVar` names, the conventional names (`ENV`, `TEST_ENV`, `APP_ENV`, `TARGET_ENV`, `CI_ENVIRONMENT_NAME`, anything ending in `_ENV`), then `metadata.env` in the config.

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

Ready-to-copy samples: [github-actions.yml](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/github-actions.yml), [Jenkinsfile](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/Jenkinsfile) and [gitlab-ci.yml](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/gitlab-ci.yml). Each one includes an optional Slack (and, for Jenkins, email) step you can uncomment.

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

### Split your run across shards, then merge into one report

Big test suite? Split it into shards so they run in parallel, then join every shard's report into one HTML at the end. Works on your laptop and on any CI.

**What happens under the hood.** Each shard runs the reporter and writes its own `reporting-labs/` folder with `index.html` plus a small `report.json` next to it. The `merge` command reads every shard's `report.json`, combines them into one dataset, copies attachments into per-shard subfolders so nothing overwrites, and renders one HTML with all tests, one Trend chart, one Failure Clusters view, and a Shards row in the Environment card.

Nothing extra to install and no config change needed. The reporter writes `report.json` on every run out of the box.

#### Try it on your laptop first

Three shards, run one after another (on a single machine you cannot really run them in parallel, but this proves the merge works end to end):

```bash
# Delete leftovers from any previous run
rm -rf all-shards merged

# Run each shard and move its folder aside so the next shard does not overwrite it
# (use ; not &&: a shard with a failing test exits 1, and && would skip its mv)
mkdir -p all-shards
npx playwright test --shard=1/3; mv reporting-labs all-shards/s1
npx playwright test --shard=2/3; mv reporting-labs all-shards/s2
npx playwright test --shard=3/3; mv reporting-labs all-shards/s3

# One command combines them
npx reporting-labs merge all-shards -o merged

# Open it
open merged/index.html          # macOS
# start merged/index.html       # Windows
# xdg-open merged/index.html    # Linux
```

Look for this line in each `npx playwright test` output:

```
reporting-labs: report written to reporting-labs/index.html
```

That line proves the reporter ran and the folder exists to move. If you do not see it, your `playwright.config.ts` is not wiring `reporting-labs` as a reporter yet — see the [Quick start](#quick-start-2-minutes).

**Custom output folder?** If your config has `outputFolder: 'my-report'`, use that name in the move step:

```bash
mv my-report all-shards/s1
```

**A real parallel run on your laptop.** Runs three shards at once, then merges when all three finish. Shards that run at the same time in one folder need their own folders, or they overwrite each other: `REPORTING_LABS_OUTPUT_FOLDER` gives each shard its own report folder, and `--output` gives each its own Playwright `test-results`:

```bash
rm -rf all-shards merged && mkdir -p all-shards
REPORTING_LABS_OUTPUT_FOLDER=all-shards/s1 npx playwright test --shard=1/3 --output=test-results/s1 &
REPORTING_LABS_OUTPUT_FOLDER=all-shards/s2 npx playwright test --shard=2/3 --output=test-results/s2 &
REPORTING_LABS_OUTPUT_FOLDER=all-shards/s3 npx playwright test --shard=3/3 --output=test-results/s3 &
wait
npx reporting-labs merge all-shards -o merged
open merged/index.html
```

In the merged report the Timeline gives every shard's workers their own rows (`S1·w0`, `S1·w1`, `S2·w0` …), the Workers card says `3 shards × 3 workers`, and the wall clock runs from the first shard's start to the last shard's end.

#### GitHub Actions

Each shard runs on its own runner in parallel, then a final `merge` job downloads every shard's report and combines them. Copy-paste as `.github/workflows/tests.yml` in your repo:

```yaml
name: Playwright tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    name: shard ${{ matrix.shard }}/4
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps

      # Keep the history file across runs so the Trend and new-vs-known
      # failures build up over time. Each shard reads the same file.
      - uses: actions/cache@v4
        with:
          path: reporting-labs.history.json
          key: reporting-labs-history-${{ github.ref_name }}-${{ github.run_id }}
          restore-keys: |
            reporting-labs-history-${{ github.ref_name }}-

      - run: npx playwright test --shard=${{ matrix.shard }}/4

      # Save this shard's report so the merge job can pick it up.
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: report-shard-${{ matrix.shard }}
          path: reporting-labs/
          retention-days: 30

  merge:
    name: merge shards into one report
    if: always()
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci

      # Downloads every 'report-shard-N' artifact under ./all-shards/report-shard-N/
      - uses: actions/download-artifact@v4
        with:
          path: all-shards
          pattern: report-shard-*

      - run: npx reporting-labs merge all-shards -o merged

      # This is the artifact your team downloads and opens.
      - uses: actions/upload-artifact@v4
        with:
          name: merged-report
          path: merged/
          retention-days: 30
```

Download the **merged-report** artifact from the run's summary page and open `index.html` locally.

#### Jenkins

Four shards run in parallel via a matrix pipeline, then a final stage merges. Copy-paste as `Jenkinsfile`:

```groovy
pipeline {
  agent any
  options { timestamps() }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
        sh 'npx playwright install --with-deps'
      }
    }

    stage('Run shards in parallel') {
      matrix {
        axes {
          axis { name 'SHARD'; values '1', '2', '3', '4' }
        }
        stages {
          stage('Test') {
            steps {
              sh "npx playwright test --shard=${SHARD}/4"
              // Save each shard's report so the merge stage can unpack it later.
              stash name: "report-shard-${SHARD}", includes: 'reporting-labs/**'
            }
          }
        }
      }
    }

    stage('Merge into one report') {
      steps {
        sh 'rm -rf all-shards merged && mkdir -p all-shards'
        script {
          ['1', '2', '3', '4'].each { s ->
            dir("all-shards/shard-${s}") { unstash "report-shard-${s}" }
          }
        }
        // Unstash lands the folder as all-shards/shard-N/reporting-labs/... — flatten it.
        sh '''
          for d in all-shards/shard-*; do
            mv "$d/reporting-labs/"* "$d/"
            rmdir "$d/reporting-labs"
          done
        '''
        sh 'npx reporting-labs merge all-shards -o merged'
        archiveArtifacts artifacts: 'merged/**', allowEmptyArchive: false
      }
    }
  }
}
```

Jenkins blocks inline JavaScript inside the HTML Publisher by default (Playwright's own HTML report has the same limitation), so the fastest way to view the merged report is to download the `merged/` folder from the build's artifacts and open `index.html` locally. If a Jenkins admin can relax the policy in the script console with `System.setProperty("hudson.model.DirectoryBrowserSupport.CSP", "")`, you can also add a `publishHTML` step to open the report right from the build page.

#### Troubleshooting

- **`mv: reporting-labs: No such file or directory`.** The reporter did not run. Check `playwright.config.ts`: `reporter: [['list'], ['reporting-labs', reportingLabs]]`. Without that line, `npx playwright test` does not create the `reporting-labs/` folder.
- **A shard reports "0 tests".** Playwright shards by spec file by default, so if you have fewer spec files than shards, some shards will be empty. Reduce the shard count, split large specs, or upgrade to Playwright 1.51+ and set `shardingMode: 'round-robin'` for per-test sharding. The merge still works either way.
- **The Trend chart looks off after merging.** All shards read the same history file at startup, so the current run is recorded once by whichever shard writes last. On CI, cache the history file (see the GitHub Actions example above) so future runs pick it up.
- **`merge` says "no report.json under ...".** The folder you pointed at does not contain a shard's report. `merge` accepts either individual shard folders (each with `report.json`) or one parent folder that has many shards as subfolders. Check that `report.json` actually exists inside — the reporter writes it on every run unless you set `emitJson: false`.
- **Attachments broken in the merged report.** Screenshots are usually embedded inline as base64, so they always work. Videos and traces live in `merged/assets/shard-N-of-M/` — the merge rewrites paths so they resolve correctly. If a video does not play, open the merged folder locally (not from a Jenkins URL that strips inline JS).

### Slack, email, Teams: use your CI's own integration

reportingLabs deliberately does not build its own Slack or email sender. Every CI already has a first-class integration you can lean on, and it stays out of the way of the report itself:

- **GitHub Actions:** `slackapi/slack-github-action` posts a message with the run URL and artifact link. `dawidd6/action-send-mail` handles email. Both are one YAML block, both take a repo secret. See the [github-actions.yml sample](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/github-actions.yml).
- **Jenkins:** the Slack Notification plugin (`slackSend`) and the Email Extension plugin (`emailext`) do the same, plus they can attach `reporting-labs/index.html`. See the [Jenkinsfile sample](https://github.com/naveenautomationlabs/reporting-labs/blob/main/docs/ci/Jenkinsfile).
- **GitLab CI:** the Slack integration in Project Settings posts pipeline results with no code at all. For a rich message, add a `notify` job with `curl` to your webhook.
- **CircleCI, Bitbucket, Azure Pipelines:** each has a native Slack orb / task; a plain `curl` to the webhook also works from any shell step.

Two reasons this stays outside the reporter:

1. Your admin most likely already set up notifications for build and deploy. The same channel serves test results with no new moving parts.
2. Notification delivery (auth, TLS, retries, corporate relays) is a full topic on its own. CI integrations handle it, this reporter stays a single HTML file.

If you need a richer machine-readable summary in the same message, add Playwright's own JSON reporter next to reportingLabs and pipe it to your Slack step:

```ts
reporter: [
  ['reporting-labs', require('./reporting-labs.config').default],
  ['json', { outputFile: 'results.json' }],
]
```

Your Slack step can then read `results.json` for pass / fail counts and top failures.

## Good to know

- **One file.** Screenshots and fonts are inside `index.html`, so it works from an email or a CI artifact. Videos and large files go to `./assets` next to it. Keep the folder together when you share it.
- **Each run replaces the report.** The old report stays until the new run finishes. Archive the folder if you want to keep an old one.
- **Videos on macOS.** If the report is in Downloads, Desktop or Documents and you open it as a file, Chrome may not be allowed to read the `assets/` folder (the player shows a clear message). Allow Chrome under System Settings → Privacy & Security → Files and Folders, move the project elsewhere, or set `embedVideos: true`.
- **Keyboard.** `j` / `k` next and previous test, `f` failed only, `/` search, `1`–`5` switch views, `Esc` close.
- **PDF.** `report.pdf` is written next to the report, and the Export PDF button in the header saves the same print-ready copy from the browser.
- **Themes.** Light and dark follow the OS. The toggle in the header remembers your choice.

## Java teams

The same report, from Java: `dev.reportinglabs` on Maven Central, for TestNG and JUnit 5, with zero-code add-ons for Selenium, REST Assured and Playwright for Java, and a Cucumber JVM plugin (one row per scenario, Given/When/Then as steps). Source: [reporting-labs-java](https://github.com/naveenautomationlabs/reporting-labs-java). Guides: [reportinglabs.dev/get-started/java](https://reportinglabs.dev/get-started/java).

## Python teams

The same report, from Python: `pip install reporting-labs` ([PyPI](https://pypi.org/project/reporting-labs/)). A pytest plugin that turns on the moment it is installed, with zero-code support for Playwright and Selenium, and a Robot Framework listener (one row per test, keywords as steps). Source: [reporting-labs-python](https://github.com/naveenautomationlabs/reporting-labs-python). Guides: [reportinglabs.dev/get-started/python](https://reportinglabs.dev/get-started/python).

## WebdriverIO

The same report, from a WebdriverIO suite (Mocha, Jasmine or Cucumber): one row per test, WebDriver commands as steps, a screenshot on failure, failure clusters and the PDF export. WebdriverIO runs a reporter per spec, so reportingLabs writes a part per runner and stitches them together in `onComplete`:

```ts
// wdio.conf.ts
import ReportingLabsReporter, { reportingLabsComplete } from 'reporting-labs/wdio';

export const config = {
  reporters: ['spec', [ReportingLabsReporter, { outputFolder: 'reporting-labs' }]],
  async onComplete() {
    await reportingLabsComplete({ outputFolder: 'reporting-labs', title: 'Web E2E' });
  },
};
```

Guide: [reportinglabs.dev/get-started/webdriverio](https://reportinglabs.dev/get-started/webdriverio).

## Cypress

The same report from `cypress run` (Cypress 13 to 16):
- **Tests:** each test under its describe block, every retry as its own attempt (flaky tests are found), passed / failed / skipped, and a spec that could not load.
- **Steps:** Cypress commands as steps, hooks grouped, the failing command marked.
- **API tab:** `cy.request` calls with request and response, and the app's own fetch / XHR calls.
- **Proof:** failure screenshots on the right attempt and the spec video.
- **Errors explained in plain words:** element not found, covered or hidden element, `cy.request` / `cy.visit` / `cy.wait` failures, errors thrown by the app.
- **Same as Playwright:** history, PDF, masking, merge.

**1. Register the plugin**

```js
// cypress.config.js
const { defineConfig } = require('cypress');
const { reportingLabs } = require('reporting-labs/cypress');

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      reportingLabs(on, config, { title: 'Checkout regression' });   // any option from "All options"
      return config;                                                 // needed: it tells the support file the plugin is on
    },
  },
});
```

**2. Import the support file** (steps, API calls, `meta()`):

```js
// cypress/support/e2e.js
import 'reporting-labs/cypress/support';
```

Run `npx cypress run`. The report is in `reporting-labs/index.html`.
A runnable example: [`examples-cypress/`](https://github.com/naveenautomationlabs/reporting-labs/tree/main/examples-cypress).

**Meta** (priority, owner, story...) with `meta()` in the test, or a comment above `it()` / `describe()`:

```js
import { meta } from 'reporting-labs/cypress/support';

/** @feature checkout @owner asha */
describe('Checkout', () => {
  it('places an order', () => {
    meta({ priority: 'P0', severity: 'critical', story: 'SHOP-12' });
    cy.visit('/cart');
  });
});
```

Good to know:
- **Your config already has `before:run`, `after:spec` or `after:run`?** Cypress keeps one handler per event, so the one registered last wins. Call ours from yours:
  ```js
  const rl = reportingLabs(on, config, { title: 'Checkout regression' });
  on('after:spec', (spec, results) => { rl.afterSpec(spec, results); /* your code */ });
  ```
  (`rl.beforeRun` and `rl.afterRun` work the same way.) If the report is missing, the run says so.
- **`cypress open`:** Cypress sends these events in `cypress run`. In `cypress open` it sends them only with `experimentalInteractiveRunEvents: true`.
- **Video:** set `video: true` in the Cypress config. The spec video is attached to failed and flaky tests (`video: 'all'` in our options for every test).
- **PDF:** printed by an installed Chrome or Edge (Cypress's own Electron cannot print it). If none is found, set `pdf: { chromePath }` or `CHROME_PATH`.
- **Split across machines** (Cypress Cloud parallel, cypress-split): each machine writes its `reporting-labs` folder. Combine them with `npx reporting-labs merge`, as in [Split your run across shards](#split-your-run-across-shards-then-merge-into-one-report).

## Roadmap

- Jest/Vitest and JUnit XML adapters
- Cucumber for Cypress (`@badeball/cypress-cucumber-preprocessor`): Gherkin steps as steps
- AI summary of failures (bring your own API key)
- Hosted history dashboard across branches and projects

## Security & privacy

reportingLabs is a library that runs inside your own test run. There is no reportingLabs server, account, API key, telemetry or licence check.

- **Nothing is sent anywhere.** The reporter makes no network requests of its own; its only traffic is the traffic your tests already make. An opened report makes no external requests either: fonts, scripts and the logo are embedded, so it works offline and behind a firewall. The only exceptions are opt-in (`embedFonts: false`, a logo given as an `https://` URL) or need a click (CI, commit and issue links).
- **Everything stays on your machine:** the report folder (`reporting-labs/` by default) holds `index.html`, `report.json`, `report.pdf` and `assets/`, plus the run history `reporting-labs.history.json` next to your project. Nothing is written anywhere else. Whoever can read your test artifacts can read the report; deleting them deletes the data.
- **Secrets are masked before anything is written:** passwords, tokens, cookies, auth headers, API keys, JWTs and card numbers in logs, API bodies and headers, test data, errors and step titles. With Playwright, a value passed to `fill()` shows in the step title unless it is a known secret, so read test passwords from environment variables (masked by default) or list them in `maskValues`. The WebdriverIO reporter and the Cypress support file mask values typed into password fields.
- **Screenshots, videos and traces are not masked.** They are images and recordings of the application, so run tests against test data, or turn them off for suites that show real personal data.
- **No runtime dependencies;** `@playwright/test` is an optional peer, the one your project already has. No install or post-install scripts. MIT licensed.

Full details for security reviewers and client projects, including what is read, what is written and what to tell a client: [reportinglabs.dev/security-privacy](https://reportinglabs.dev/security-privacy). To report a vulnerability, open an issue saying you have a security report (no details) and a private channel will be arranged.

## License

MIT © Naveen Automation Labs
