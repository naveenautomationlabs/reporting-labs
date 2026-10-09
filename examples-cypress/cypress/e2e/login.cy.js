// Meta as comments: no import needed. The describe comment applies to every test inside.

/** @feature login @owner asha */
describe('Login', () => {
  beforeEach(() => { cy.visit('/login'); });

  /** @priority P0 @severity critical @story SHOP-12 */
  it('signs in with a valid user @smoke', () => {
    cy.get('#user').type('asha');
    cy.get('#pass').type('Demo-Pass-123');       // typed into a password field: shown as **** in the report
    cy.get('#go').click();
    cy.get('h1').should('have.text', 'Welcome');
  });

  /** @priority P1 */
  it('shows an error for a wrong password', () => {
    cy.get('#user').type('asha');
    cy.get('#go').click();
    cy.get('.error').should('be.visible');       // fails: the demo app has no error message → "Element not found"
  });

  it('remembers the user (flaky)', () => {
    // fails on the first try and passes on the retry: the report marks it flaky
    if (Cypress.currentRetry === 0) cy.get('#remember-me').check();
    else cy.get('#remember').check();
  });
});
