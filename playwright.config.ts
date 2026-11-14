import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  webServer: { command: 'node scripts/serve-web-test.mjs', url: 'http://127.0.0.1:4173/__inference_test', reuseExistingServer: false },
});
