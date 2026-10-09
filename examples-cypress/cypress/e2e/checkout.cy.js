describe('Checkout', () => {
  // a failing before() hook: the first test fails with the reason, Cypress skips the others
  before(() => { cy.visit('/checkout'); });   // 404 in the demo app → "Page did not load"

  it('adds to cart', () => {});
  it('pays', () => {});
});
