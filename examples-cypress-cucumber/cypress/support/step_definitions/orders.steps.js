const { When, Then } = require('@badeball/cypress-cucumber-preprocessor');
const { meta } = require('reporting-labs/cypress/support');

When('I request the users', () => {
  cy.request({ url: '/api/users', headers: { authorization: 'Bearer demo-token-123' } }).as('users');
});

Then('I see these users:', table => {
  cy.get('@users').its('body').then(users => {
    for (const row of table.hashes()) expect(users.some(u => String(u.id) === row.id && u.name === row.name), row.name).to.be.true;
  });
});

When('I post an order:', body => {
  cy.request('POST', '/api/orders', JSON.parse(body)).as('order');   // the demo API answers 500
});

Then('the order is accepted', () => {
  cy.get('@order').its('status').should('eq', 201);
});

When('I post an order for a gift', () => {
  meta({ owner: 'ravi', priority: 'P2' });   // meta() in a step, like in a spec
  cy.request({ method: 'POST', url: '/api/orders', body: { item: 'gift', qty: 1 }, failOnStatusCode: false });
});

Then('the gift is wrapped', () => 'pending');   // not written yet: the scenario is skipped with the reason

// "When I cancel order 7" has no step definition on purpose: the report says so
