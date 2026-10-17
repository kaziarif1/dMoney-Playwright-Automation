# dMoney Playwright Automation

**Author:** Kazi Abu Jafor Arif  
**Batch:** 19  
**Track:** Software Development and Engineering in Test (SDET)

End-to-end automation for the [dMoney training portal](https://dmoneyportal.roadtocareer.net).

## Setup and run

Requirements: Node.js 20+, a Gmail inbox for Agent OTP/password-reset emails, portal Admin/System credentials, and an existing Customer's 11-digit phone number.

1. Copy `.env.example` to `.env` and fill in the required local values. Never commit credentials, OTPs, or reset links.
2. Install dependencies and Chromium:

   ```powershell
   npm ci
   npx playwright install chromium
   ```

3. Run the positive smoke suite or headed regression:

   ```powershell
   npm run test:smoke
   $env:PW_HEADED='1'; npm run test:regression
   ```

The regression reads the new Agent OTP and password-reset email using Gmail API OAuth. Enable Gmail API, create an OAuth client, and authorize the inbox with the read-only scope `https://www.googleapis.com/auth/gmail.readonly`. Put `DMONEY_GMAIL_CLIENT_ID`, `DMONEY_GMAIL_CLIENT_SECRET`, and `DMONEY_GMAIL_REFRESH_TOKEN` in local `.env`; never commit these values. The test covers Agent registration and activation, deposits and balance checks, password reset, statement assertions, and verified CSV export to `output/self_statement_YYYY-MM-DD.csv`. CSV output and test artifacts are excluded from Git.

## Assignment coverage

- Registers a new Agent and verifies the account is initially pending.
- Uses the Admin account to activate the Agent and confirms the status remains active after reload.
- Uses the System account to deposit 2,000 BDT, then verifies the Agent's balance.
- Verifies a 500 BDT Agent-to-Customer deposit, resulting balance, and statement transaction.
- Resets the Agent password, checks the old password is rejected and the new one works, then validates and exports the Self Statement to CSV.

## Evidence

The latest headed regression passed on 17 Oct 2026 (1 test passed in 1.4 minutes). The smoke suite passed 2/2 tests in a previous run.

| Regression | Smoke |
|---|---|
| ![Regression results](docs/evidence/regression-result.png) | ![Smoke results](docs/evidence/smoke-result.png) |

[Watch the headed regression](docs/evidence/regression-video.webm). The workflow and transaction results remain visible; OTPs and personal/account identifiers are obscured.

## Repository

[GitHub repository](https://github.com/kaziarif1/dMoney-Playwright-Automation)
