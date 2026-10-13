# reportingLabs with Cypress and Cucumber

A tiny local shop app and two feature files that show what the report does with
[@badeball/cypress-cucumber-preprocessor](https://github.com/badeball/cypress-cucumber-preprocessor): scenarios
under their Feature and Rule, Given / When / Then steps with the Cypress commands each one ran, the steps a failure
left unrun, Scenario Outline rows, data tables and doc strings, tags as filters and meta, `cy.request` calls in the API
tab, a flaky scenario, a pending step, a step with no step definition, screenshots and video. Runs offline in under a
minute.

```bash
git clone https://github.com/naveenautomationlabs/reporting-labs
cd reporting-labs/examples-cypress-cucumber
npm install
npx cypress run
```

Then open `reporting-labs/index.html`. Some scenarios fail on purpose, so the report has something to show.

| File | Shows |
|---|---|
| [cypress.config.js](cypress.config.js) | The preprocessor, then `reportingLabs()` (in that order), and the demo app |
| [cypress/support/e2e.js](cypress/support/e2e.js) | The one import that brings the steps, API calls and `meta()` |
| [cypress/e2e/login.feature](cypress/e2e/login.feature) | Feature tags as meta, a Background, a masked password, element not found and the step it left unrun, an Outline, a flaky scenario |
| [cypress/e2e/orders.feature](cypress/e2e/orders.feature) | Rules, a data table, a doc string, a 500 from the API, a pending step, a step with no definition |
| [cypress/support/step_definitions](cypress/support/step_definitions) | The step definitions, a named `Before` hook, `meta()` in a step |

Guide: [reportinglabs.dev/get-started/cypress](https://reportinglabs.dev/get-started/cypress#cucumber)
