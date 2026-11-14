import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Full release regression matrix; the throttled startup test uses Chromium CDP.
export default defineConfig({
  ...base,
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium' } },
    { name: 'chromium-phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'webkit-phone', grepInvert: /phone startup/, use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'firefox-desktop', grepInvert: /phone startup/, use: { browserName: 'firefox' } },
  ],
});
