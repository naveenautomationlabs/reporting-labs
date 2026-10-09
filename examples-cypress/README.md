# reportingLabs with Cypress

A tiny local shop app and a few specs that show what the report does with Cypress: commands as steps, hooks,
`cy.request` calls in the API tab, a flaky test found through a retry, plain-language errors, a failing `before()`
hook, meta from comments and from `meta()`, screenshots and video. Runs offline in under a minute.

```bash
git clone https://github.com/naveenautomationlabs/reporting-labs
cd reporting-labs/examples-cypress
npm install
npx cypress run
```

Then open `reporting-labs/index.html`. Some tests fail on purpose, so the report has something to show.

| File | Shows |
|---|---|
| [cypress.config.js](cypress.config.js) | The plugin, its options, and the demo app started in `setupNodeEvents` |
| [cypress/support/e2e.js](cypress/support/e2e.js) | The one import that brings steps, API calls and `meta()` |
| [cypress/e2e/login.cy.js](cypress/e2e/login.cy.js) | Meta as comments, a `beforeEach` hook, a masked password, element not found, a flaky test |
| [cypress/e2e/api.cy.js](cypress/e2e/api.cy.js) | `meta()`, `cy.request` with masked headers and bodies, a 500, a skipped test |
| [cypress/e2e/checkout.cy.js](cypress/e2e/checkout.cy.js) | A failing `before()` hook and the tests Cypress skips because of it |

Guide: [reportinglabs.dev/get-started/cypress](https://reportinglabs.dev/get-started/cypress)
