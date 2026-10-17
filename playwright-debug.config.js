const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  outputDir: 'test-results/',
  timeout: 10 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://dmoneyportal.roadtocareer.net',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    headless: false,
    launchOptions: { slowMo: 1_000 },
    screenshot: 'only-on-failure',
    video: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
