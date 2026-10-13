const { Given, When, Then, Before } = require('@badeball/cypress-cucumber-preprocessor');

Before({ name: 'fresh session' }, () => {
  cy.clearCookies();
});

Given('I open the login page', () => {
  cy.visit('/login');
});

When('I sign in as {string} with password {string}', (user, password) => {
  cy.get('#user').type(user);
  cy.get('#pass').type(password);        // a password field: masked in the report
  cy.get('#go').click();
});

Then('I see the heading {string}', heading => {
  cy.get('h1').should('have.text', heading);
});

Then('I see an error message', () => {
  cy.get('.error').should('be.visible');   // fails on purpose: element not found, the next step is not run
});

Then('I stay on the login page', () => {
  cy.url().should('include', '/login');
});

When('I tick {string}', label => {
  cy.contains('label', label).find('input').check();
});

// flaky on purpose: fails on the first attempt, passes on the retry
Then('the box stays ticked', () => {
  cy.get('#remember').should(Cypress.currentRetry > 0 ? 'be.checked' : 'not.be.checked');
});
