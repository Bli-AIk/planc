const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/browser', fullyParallel: false, workers: 1, timeout: 30000,
  use: { headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: 'list'
});
