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

Enter the OTP in the headed browser when prompted. For password reset, copy the email's one-time link into `DMONEY_AGENT_RESET_URL` in `.env` when prompted. The regression covers Agent registration and activation, System funding, Agent-to-Customer deposit, balances and statement checks, password reset, and CSV export to `output/self_statement_YYYY-MM-DD.csv`. It verifies the CSV is written and includes the expected transactions. CSV output and test artifacts are local and excluded from Git.

## Evidence

Latest results: regression passed; smoke suite passed 2/2 tests.

| Regression | Smoke |
|---|---|
| ![Regression results](docs/evidence/regression-result.png) | ![Smoke results](docs/evidence/smoke-result.png) |

[Watch the headed regression](docs/evidence/regression-video-redacted.mp4). Personal details, account identifiers, passwords, and OTPs are masked in the video.

## Repository

[GitHub repository](https://github.com/kaziarif1/dMoney-Playwright-Automation)
