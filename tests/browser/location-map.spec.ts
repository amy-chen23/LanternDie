import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '')
  .trim().replace(/^['"]|['"]$/g, '');
const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const user = {
  id: userId, aud: 'authenticated', role: 'authenticated', email: 'map-qa@example.invalid',
  user_metadata: { display_name: 'Map QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z',
};

async function openApp(page: Page, context: BrowserContext) {
  if (api) {
    const projectRef = new URL(api).hostname.split('.')[0];
    const payload = Buffer.from(JSON.stringify({ sub: userId, exp: 4102444800, role: 'authenticated' })).toString('base64url');
    await page.addInitScript(({ projectRef, user, payload }) => {
      localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({
        access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,
        refresh_token: 'fixture-only',
        token_type: 'bearer',
        expires_at: 4102444800,
        expires_in: 3600,
        user,
      }));
    }, { projectRef, user, payload });
    await page.route(`${api}/**`, route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(route.request().url().endsWith('/auth/v1/user') ? user : []),
    }));
    await page.goto('/');
  } else {
    await page.goto('/');
    await page.getByText('Preview the app', { exact: true }).click();
  }
  await expect(page.getByRole('tab', { name: 'Sightings', exact: true })).toBeVisible();
}

test('Map follows Sightings and centers/recenters the web map from device location', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
  await openApp(page, context);

  const tabs = page.getByRole('tab');
  const mainTabLabels = await tabs.evaluateAll(items => items
    .map(item => item.getAttribute('aria-label'))
    .filter(label => ['Sightings', 'Map', 'Leaderboard', 'My Profile'].includes(label ?? '')));
  expect(mainTabLabels).toEqual(['Sightings', 'Map', 'Leaderboard', 'My Profile']);

  const mapTab = page.getByRole('tab', { name: 'Map', exact: true });
  await mapTab.click();
  await expect(mapTab).toHaveAttribute('aria-selected', 'true');
  const map = page.getByTitle('Map centered on your location');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('src', /marker=37\.7749%2C-122\.4194/);

  const originalMap = await map.elementHandle();
  if (!originalMap) throw new Error('The map frame did not render.');
  await page.getByRole('button', { name: 'Recenter map' }).click();
  await expect.poll(() => originalMap.evaluate(frame => frame.isConnected)).toBe(false);
  await expect(map).toHaveAttribute('src', /marker=37\.7749%2C-122\.4194/);
});

test('Map explains when location permission is denied and offers a retry', async ({ page, context }) => {
  await context.grantPermissions([]);
  await openApp(page, context);

  await page.getByRole('tab', { name: 'Map', exact: true }).click();
  await expect(page.getByText(/Location permission is off/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try location again' })).toBeVisible();
  await expect(page.getByTitle('Map centered on your location')).toHaveCount(0);
});

test('Map explains when the device cannot provide a location fix', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(
          _success: PositionCallback,
          failure: PositionErrorCallback | null,
        ) {
          failure?.({
            code: 2,
            message: 'No position is available.',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        },
        watchPosition() { return 1; },
        clearWatch() {},
      },
    });
  });
  await openApp(page, context);

  await page.getByRole('tab', { name: 'Map', exact: true }).click();
  await expect(page.getByText(/Location unavailable/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try location again' })).toBeVisible();
  await expect(page.getByTitle('Map centered on your location')).toHaveCount(0);
});
