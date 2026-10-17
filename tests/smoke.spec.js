const { test, expect } = require('@playwright/test');

test.describe('Smoke - positive public flows', () => {
  test('portal home exposes sign up and login entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /real fintech application/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up|get started free|create free account/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /login/i }).first()).toBeVisible();
    await page.getByRole('link', { name: /sign up|get started free|create free account/i }).first().click();
    await expect(page).toHaveURL(/\/register(?:[/?#]|$)/);
  });

  test('registration form explains required fields and pending approval', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByText('Create an Account', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Full Name' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email Address' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Phone Number' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'National ID (NID)' })).toBeVisible();
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByText(/pending approval/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });
});
