# reportingLabs with Playwright BDD

A tiny local shop app and two feature files that show what the report does with
[playwright-bdd](https://github.com/vitalets/playwright-bdd) (Cucumber feature files on the Playwright test runner):
scenarios at their line in the `.feature` file under their Feature and Rule, Given / When / Then steps with the
Playwright calls each one made, Background steps, the steps a failure left unrun, Scenario Outline rows with their
Examples, data tables and doc strings, tags as filters and meta, API calls with request and response, a step with no
step definition, screenshots and traces. Runs offline in under a minute.

```bash
git clone https://github.com/naveenautomationlabs/reporting-labs
cd reporting-labs/examples-playwright-bdd
npm install
npx playwright install chromium
npm test                     # npx bddgen && npx playwright test
```

Then open `reporting-labs/index.html`. Some scenarios fail on purpose, so the report has something to show.

| File | Shows |
|---|---|
| [playwright.config.ts](playwright.config.ts) | `defineBddConfig()` and the reporter, in the normal Playwright config |
| [features/login.feature](features/login.feature) | Feature tags as meta, a Background, a masked password, element not found and the step it left unrun, a Scenario Outline |
| [features/orders.feature](features/orders.feature) | Rules, a doc string, a data table, a 500 from the API, a step with no step definition |
| [steps/](steps) | The step definitions, a named `Before` hook and a custom fixture |

Guide: [reportinglabs.dev/get-started/nodejs#playwright-bdd](https://reportinglabs.dev/get-started/nodejs#playwright-bdd)
