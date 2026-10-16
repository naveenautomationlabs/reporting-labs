import { expect } from '@playwright/test';
import { Given, When, Then, Before } from './fixtures';

Before({ name: 'fresh session' }, async ({ context }) => { await context.clearCookies(); });

Given('I open the login page', async ({ page }) => { await page.goto('/login'); });
When('I sign in as {string} with password {string}', async ({ page }, user: string, password: string) => {
  await page.locator('#user').fill(user);
  await page.locator('#pass').fill(password);
  await page.locator('#go').click();
});
Then('I see the message {string}', async ({ page }, text: string) => { await expect(page.locator('#msg')).toHaveText(text); });
Then('I see an error banner', async ({ page }) => { await expect(page.locator('.error-banner')).toBeVisible({ timeout: 1500 }); });
Then('I stay on the login page', async ({ page }) => { await expect(page).toHaveURL(/login/); });
