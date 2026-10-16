import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import type { DataTable } from 'playwright-bdd';

Given('I am logged in as {string}', async ({ request, token }, user: string) => {
  const res = await request.post('/api/login', { data: { user, password: user === 'ravi' ? 'Ravi-Pass-02' : 'x' } });
  expect(res.status()).toBe(200);
  token.value = (await res.json()).token;
});
When('I post an order:', async ({ request, token }, body: string) => {
  const res = await request.post('/api/orders', { headers: { authorization: `Bearer ${token.value}` }, data: JSON.parse(body) });
  expect(res.status()).toBe(201);
  token.order = await res.json();
});
Then('the order is created', async ({ token }) => { expect(token.order.status).toBe('created'); });
Then('I can cancel it', async ({ request, token }) => {
  const res = await request.delete(`/api/orders/${token.order.id}`, { headers: { authorization: `Bearer ${token.value}` } });
  expect(res.status(), 'cancel the order').toBe(204);
});
Then('these products cost:', async ({ request }, table: DataTable) => {
  for (const row of table.hashes()) {
    const res = await request.get(`/api/products/${row.id}`);
    expect((await res.json()).price).toBe(Number(row.price));
  }
});
When('I post an order without a token', async ({ request, token }) => { token.order = await request.post('/api/orders', { data: { productId: 1, qty: 1 } }); });
Then('the API answers {int}', async ({ token }, code: number) => { expect(token.order.status()).toBe(code); });
