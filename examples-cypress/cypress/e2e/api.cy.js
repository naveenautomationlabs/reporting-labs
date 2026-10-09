import { meta } from 'reporting-labs/cypress/support';

describe('API', () => {
  it('lists users', () => {
    meta({ priority: 'P1', owner: 'ravi', story: 'SHOP-40' });
    // in the API tab with request and response; the password in the body and the auth header are masked
    cy.request({ url: '/api/users', headers: { authorization: 'Bearer demo-token-abc123' } })
      .its('status').should('eq', 200);
  });

  it('places an order', () => {
    meta({ priority: 'P0', owner: 'ravi', severity: 'blocker' });
    cy.request({ method: 'POST', url: '/api/orders', body: { item: 'book', qty: 1 } });   // 500 → "API call failed"
  });

  it.skip('refunds an order', () => {});
});
