import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';

test('production export contains no classifier model, worker or WASM runtime', () => {
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const name = path.join(directory, entry.name);
      return entry.isDirectory() ? files(name) : [name];
    });
  }
  expect(files('dist').filter(name => /\.onnx$|\.wasm$|death-worker|[/\\]inference[/\\]/.test(name))).toEqual([]);
});

test('production app shell loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name:'Continue with Google' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone startup stays within the JS budget and does not load inference assets', async ({ page, context }) => {
  await page.setViewportSize({ width:390, height:844 });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate:4 });
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline:false, latency:120, downloadThroughput:500_000, uploadThroughput:125_000,
  });
  const inferenceRequests: string[] = [];
  let appBytes = 0;
  page.on('request', request => { if (request.url().includes('/inference/')) inferenceRequests.push(request.url()); });
  page.on('response', response => {
    if (response.url().includes('/_expo/static/js/web/AppEntry')) appBytes = Number(response.headers()['content-length'] ?? 0);
  });
  await page.goto('/', { waitUntil:'domcontentloaded' });
  await expect(page.getByRole('button', { name:'Continue with Google' })).toBeVisible({ timeout:20_000 });
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry.name.includes('/_expo/static/js/web/AppEntry'))
    .reduce((sum, entry) => sum + (entry as PerformanceResourceTiming).decodedBodySize, 0));
  expect(bytes || appBytes).toBeGreaterThan(0);
  expect(bytes || appBytes).toBeLessThan(1_300_000);
  expect(inferenceRequests).toEqual([]);
});
