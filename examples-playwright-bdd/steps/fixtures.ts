import { test as base, createBdd } from 'playwright-bdd';

export const test = base.extend<{ token: { value?: string; order?: any } }>({
  token: async ({}, use) => { await use({}); },
});
export const { Given, When, Then, Before, After } = createBdd(test);
