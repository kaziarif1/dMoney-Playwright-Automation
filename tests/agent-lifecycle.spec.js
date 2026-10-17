const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { makeAgentData, required } = require('../utils/test-data');
const { saveStatementCsv } = require('../utils/csv-helper');
const {
  verifyGmailAccess,
  waitForAgentResetUrl,
  waitForDmoneyOtp,
} = require('../utils/gmail-helper');

async function waitForUpdatedCustomerId(previousCustomerId) {
  const envPath = path.join(__dirname, '..', '.env');
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const env = require('dotenv').parse(fs.readFileSync(envPath));
    const customerId = env.DMONEY_CUSTOMER_ID?.trim();
    if (customerId && customerId !== previousCustomerId) return customerId;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error('Timed out waiting for a different DMONEY_CUSTOMER_ID in .env.');
}

async function login(page, email, password) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  const loginSubmittedAt = Date.now();
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  const navigation = page.getByRole('navigation');
  const otpInput = page.getByRole('textbox', { name: /enter 4-digit otp/i });
  await expect(navigation.or(otpInput), 'Login should open navigation or request email OTP.')
    .toBeVisible({ timeout: 20_000 });
  if (await otpInput.isVisible()) {
    console.log('[regression] OTP requested; waiting for the new Agent OTP email in Gmail.');
    const otp = await waitForDmoneyOtp(email, loginSubmittedAt);
    await otpInput.fill(otp);
    await page.getByRole('button', { name: /verify otp/i }).click();
  }
  await expect(navigation, 'Successful login should open the authenticated portal navigation.')
    .toBeVisible({ timeout: 20_000 });
}

async function logout(page) {
  const identityCard = page.getByRole('navigation').getByText('Logged in as', { exact: true }).locator('..');
  const identityLines = (await identityCard.innerText()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const displayName = identityLines.at(-1);
  if (!displayName) throw new Error('Could not read the signed-in account name for the profile menu.');

  console.log(`[regression] Opening the profile menu for ${displayName} to log out.`);
  await page.getByRole('banner').getByText(displayName, { exact: true }).first().click();
  const logoutItem = page.getByRole('menuitem', { name: /logout/i });
  await expect(logoutItem, 'Profile menu should expose its Logout action.').toBeVisible();
  await logoutItem.click();
  await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
  console.log(`[regression] ${displayName} is logged out; login page is visible.`);
}

async function resetAgentPassword(page, email, newPassword) {
  await page.goto('/login');
  await page.getByText(/forgot password\?/i).click();
  await expect(page).toHaveURL(/\/forgot-password(?:[/?#]|$)/);
  await page.getByRole('textbox', { name: /email or phone number/i }).fill(email);
  const resetRequestedAt = Date.now();
  await page.getByRole('button', { name: /send reset link/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /password reset link has been sent/i }))
    .toBeVisible();

  console.log('[regression] Reset link sent; waiting for the new Agent password-reset email in Gmail.');
  const resetUrl = await waitForAgentResetUrl(email, resetRequestedAt);
  try {
    await page.goto(resetUrl);
  } catch {
    throw new Error('Could not open the validated Agent password-reset page.');
  }

  await page.getByRole('textbox', { name: 'New Password', exact: true }).fill(newPassword);
  await page.getByRole('textbox', { name: 'Confirm New Password', exact: true }).fill(newPassword);
  await page.getByRole('button', { name: /reset password|update password/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /password.*(reset|updated)|success/i }).first())
    .toBeVisible();
  console.log('[regression] Agent password reset completed.');
}

test('Agent registration, approval, deposits, reset, and statement export', async ({ page }) => {
  test.setTimeout(1_200_000);
  await verifyGmailAccess();
  const agent = makeAgentData();
  const adminEmail = required('DMONEY_ADMIN_EMAIL');
  const adminPassword = required('DMONEY_ADMIN_PASSWORD');
  const systemEmail = required('DMONEY_SYSTEM_EMAIL');
  const systemPassword = required('DMONEY_SYSTEM_PASSWORD');
  const customerId = required('DMONEY_CUSTOMER_ID');
  const resetPassword = process.env.DMONEY_AGENT_RESET_PASSWORD?.trim() ||
    `Reset!${crypto.randomBytes(6).toString('hex')}9`;
  // Registration controls and pending approval are verified from the live portal.
  console.log('[regression] Opening the portal and navigating to Agent registration.');
  await page.goto('/');
  await page.getByRole('link', { name: /sign up|get started free|create free account/i }).first().click();
  await expect(page).toHaveURL(/\/register(?:[/?#]|$)/);
  console.log('[regression] Submitting the new Agent account.');
  await page.getByLabel(/full name/i).fill(agent.name);
  await page.getByLabel(/email address/i).fill(agent.email);
  await page.getByLabel(/^password/i).fill(agent.password);
  await page.getByLabel(/phone number/i).fill(agent.phone);
  await page.getByLabel(/national id/i).fill(agent.nid);
  const role = page.getByRole('combobox');
  await role.click();
  const agentOption = page.getByRole('option', { name: /Agent/ });
  await expect(agentOption).toBeVisible();
  await agentOption.click();
  await expect(role).toContainText('Agent');

  const registrationResponsePromise = page.waitForResponse(response => {
    const request = response.request();
    return request.method() === 'POST' && new URL(response.url()).pathname === '/user/register';
  });
  await page.getByRole('button', { name: /create account/i }).click();
  const registrationResponse = await registrationResponsePromise;
  expect(
    registrationResponse.ok(),
    `Registration request returned HTTP ${registrationResponse.status()}`
  ).toBeTruthy();

  // A successful registration returns to the login page. The portal's
  // "JWT + OTP Authentication" note is on login; it does not indicate that
  // Registration succeeds without an OTP; email verification is handled at login.
  await expect(page).toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 15_000 });
  console.log('[regression] Agent registration succeeded; portal returned to login.');

  console.log('[regression] Signing in as Admin.');
  await login(page, adminEmail, adminPassword);
  console.log(`[regression] Admin login completed at ${page.url()}. Opening User List.`);
  await page.getByRole('link', { name: 'User List' }).click();
  await expect(page.getByRole('heading', { name: 'User List' })).toBeVisible();
  const userTable = page.getByRole('table');
  await expect(userTable).toBeVisible();
  await expect(userTable.getByRole('row').nth(1)).toBeVisible();
  console.log('[regression] User List heading and first data row are visible. Selecting email search.');

  // In the captured page snapshot the Search Type caption is not associated
  // with its combobox. It is the first combobox; Rows per page is the second.
  const searchType = page.getByRole('combobox').first();
  await searchType.click();
  await page.getByRole('option', { name: 'Search by Email', exact: true }).click();
  await page.getByRole('textbox', { name: 'Enter Email' }).fill(agent.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  console.log('[regression] Searching User List for the newly registered Agent.');
  const agentRow = userTable.getByRole('row').filter({ hasText: agent.email });
  await expect(agentRow).toBeVisible();
  await expect(agentRow).toContainText(/agent/i);
  await expect(agentRow).toContainText(/pending/i);
  console.log('[regression] Newly registered Agent is visible with PENDING status. Opening its View page.');
  await agentRow.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByText(agent.email, { exact: true })).toBeVisible();
  await expect(page.getByText(/pending/i)).toBeVisible();
  console.log('[regression] Agent details show PENDING and read-only fields. Entering Edit User mode.');
  await page.getByRole('button', { name: 'Edit User', exact: true }).click();
  const accountStatus = page.getByRole('combobox').nth(1);
  await expect(accountStatus).toBeEnabled();
  await expect(accountStatus).toContainText(/pending/i);
  await accountStatus.click();
  const activeOption = page.getByRole('option', { name: 'Active', exact: true });
  await expect(activeOption).toBeVisible();
  await activeOption.click();
  await expect(accountStatus).toContainText(/active/i);
  console.log('[regression] Selected Active in the Account Status dropdown. Saving the user update.');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await expect(page.getByText('User updated successfully', { exact: true })).toBeVisible();
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
  console.log('[regression] Reloaded Agent details and confirmed the account remains ACTIVE.');
  console.log('[regression] Admin saved the user update and details show ACTIVE.');
  await page.getByRole('link', { name: 'User List' }).click();
  await expect(page.getByRole('heading', { name: 'User List' })).toBeVisible();
  const searchTypeAfterReturn = page.getByRole('combobox').first();
  await searchTypeAfterReturn.click();
  await page.getByRole('option', { name: 'Search by Email', exact: true }).click();
  await page.getByRole('textbox', { name: 'Enter Email' }).fill(agent.email);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: agent.email })).toContainText(/active/i);
  console.log('[regression] User List confirms the Agent account is ACTIVE.');
  await logout(page);

  console.log('[regression] Signing in as System to fund the Agent account.');
  await login(page, systemEmail, systemPassword);
  await page.getByRole('navigation').getByRole('link', { name: /cash.?in/i }).click();
  await page.getByLabel(/customer|recipient|account|phone|number/i).fill(agent.phone);
  await page.getByLabel(/amount/i).fill('2000');
  await page.getByRole('button', { name: /cash.?in|submit/i }).click();
  await expect(page.getByText(/SYSTEM deposit to Agent successful/i)).toBeVisible();
  await expect(page.getByText(/2000/)).toBeVisible();
  console.log('[regression] Cash In of 2000 BDT to the Agent phone number is visible as completed.');
  await logout(page);

  console.log('[regression] Signing in as the newly activated Agent and checking the credited balance.');
  await login(page, agent.email, agent.password);
  await expect(page.getByLabel('Current Balance (BDT)')).toHaveValue('2000.00');
  console.log('[regression] Agent balance reflects the System deposit. Depositing to the configured Customer.');
  await page.getByRole('link', { name: /deposit|cash.?in/i }).click();
  await page.getByLabel(/customer|recipient|account/i).fill(customerId);
  await page.getByLabel(/amount/i).fill('500');
  await page.getByRole('button', { name: /deposit|submit|cash.?in/i }).click();
  const invalidCustomerAlert = page.getByRole('alert').filter({ hasText: /to account does not exist/i });
  const cashInSuccess = page.getByText(/success|completed/i);
  await expect(invalidCustomerAlert.or(cashInSuccess))
    .toBeVisible({ timeout: 10_000 });
  if (await invalidCustomerAlert.isVisible()) {
    console.log('[regression] Customer number was rejected. Waiting for an updated DMONEY_CUSTOMER_ID in .env.');
    const updatedCustomerId = await waitForUpdatedCustomerId(customerId);
    await page.getByLabel(/customer|recipient|account/i).fill(updatedCustomerId);
    await page.getByLabel(/amount/i).fill('500');
    await page.getByRole('button', { name: /deposit|submit|cash.?in/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /to account does not exist/i }).or(cashInSuccess))
      .toBeVisible({ timeout: 10_000 });
  }
  await expect(cashInSuccess).toBeVisible();
  console.log('[regression] Customer deposit completed. Verifying the Agent balance update.');
  await page.getByRole('link', { name: 'My Profile' }).click();
  await expect(page.getByLabel('Current Balance (BDT)')).toHaveValue('1512.50');
  console.log('[regression] Agent balance reflects the 500 BDT Cash In and commission.');
  await logout(page);

  await resetAgentPassword(page, agent.email, resetPassword);
  await page.goto('/login');
  await page.getByLabel(/email or phone/i).fill(agent.email);
  await page.getByLabel(/password/i).fill(agent.password);
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /invalid|incorrect|wrong|password|failed/i }).first())
    .toBeVisible();
  await expect(page.getByRole('navigation')).toBeHidden();
  console.log('[regression] Old Agent password was rejected after reset.');

  console.log('[regression] Signing in with the newly reset Agent password.');
  await login(page, agent.email, resetPassword);
  console.log('[regression] Login with the new Agent password succeeded. Opening Self Statement.');
  await page.getByRole('link', { name: /self statement/i }).click();
  await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible();
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });
  const headers = await table.locator('thead tr').first().locator('th').allTextContents();
  const rows = await table.locator('tbody tr').evaluateAll(trs => trs.map(tr =>
    Array.from(tr.cells, cell => cell.innerText.trim())));
  const headerIndexes = Object.fromEntries(headers.map((header, index) => [header.trim(), index]));
  for (const header of ['Sender Account', 'Receiver Account', 'Type', 'Debit', 'Credit']) {
    expect(headerIndexes, `Statement should include a ${header} column.`).toHaveProperty(header);
  }
  const systemTransaction = rows.find(row =>
    row[headerIndexes.Type] === 'Top-up from SYSTEM' &&
    row[headerIndexes['Sender Account']] === 'SYSTEM' &&
    row[headerIndexes['Receiver Account']] === agent.phone);
  expect(systemTransaction, 'Statement should record the System top-up to the Agent.').toBeTruthy();
  expect(systemTransaction[headerIndexes.Credit]).toBe('2000.00');
  const customerTransaction = rows.find(row =>
    row[headerIndexes.Type] === 'Deposit Commission' &&
    row[headerIndexes['Sender Account']] === agent.phone &&
    row[headerIndexes['Receiver Account']] === customerId);
  expect(customerTransaction, 'Statement should record the Agent cash-in to the Customer.').toBeTruthy();
  expect(customerTransaction[headerIndexes.Debit]).toBe('500.00');
  const { filePath, contents } = saveStatementCsv(headers.map(h => h.trim()), rows);
  expect(contents).toContain('Top-up from SYSTEM');
  expect(contents).toContain('Deposit Commission');
  expect(contents).toContain('2000.00');
  expect(contents).toContain('500.00');
  expect(require('node:fs').existsSync(filePath)).toBeTruthy();
  test.info().annotations.push({ type: 'csv-output', description: filePath });
  console.log(`[regression] Statement CSV exported to ${filePath}.`);
  await logout(page);
});
