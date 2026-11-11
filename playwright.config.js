// End-to-end tests: `npm test`. GitHub runs them on every push (.github/workflows/test.yml).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:8765/',
    trace: 'off',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 1000 },
  },
  webServer: {
    command: 'node tests/serve.js',
    url: 'http://localhost:8765/',
    reuseExistingServer: !process.env.CI,
  },
});
