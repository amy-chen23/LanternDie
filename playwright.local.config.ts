import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Check an already-running Expo web server rather than an exported dist build.
export default defineConfig({
  ...base,
  webServer: undefined,
  use: { baseURL: process.env.EXPO_TEST_URL ?? 'http://localhost:8081', browserName: 'chromium' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
