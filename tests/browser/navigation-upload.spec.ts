import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const photo = 'tests/fixtures/browser-inference/above.jpg';

async function openApp(page: Page) {
  test.skip(!api, 'Requires the public API URL at build time; all API requests are mocked.');
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'qa@example.invalid', user_metadata: { display_name: 'Navigation QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const projectRef = new URL(api).hostname.split('.')[0];
  const payload = Buffer.from(JSON.stringify({ sub: owner, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ projectRef, user, payload }) => {
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
  }, { projectRef, user, payload });
  await page.route(`${api}/**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/auth/v1/user') ? user : []) }));
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Sightings', exact: true })).toHaveAttribute('aria-selected', 'true');
}

for (const width of [390, 1440]) {
  test(`navigation, web gutters and photo draft at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openApp(page);
    await expect(page.getByRole('tab', { name: 'Home', exact: true })).toHaveCount(0);
    const profile = page.getByRole('tab', { name: 'My Profile', exact: true });
    await expect(profile).toBeVisible();
    const sightings = page.getByRole('tab', { name: 'Sightings', exact: true });
    const leaderboard = page.getByRole('tab', { name: 'Leaderboard', exact: true });
    const add = page.getByRole('button', { name: 'Add a photo', exact: true });
    const nav = sightings.locator('..');
    const bounds = await nav.boundingBox();
    expect(bounds!.width).toBe(Math.min(width, 760));
    expect(bounds!.x).toBe((width - bounds!.width) / 2);
    const plus = await add.boundingBox();
    expect(plus!.x + plus!.width / 2).toBeCloseTo(width / 2, 1);
    expect(plus!.height).toBeGreaterThanOrEqual(44);
    await leaderboard.click();
    await expect(page.getByText('YOUR CURRENT STREAK', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('leaderboard.png') });
    await expect(page.getByRole('button', { name: 'Open profile' })).toHaveCount(0);
    await profile.click();
    await expect(page.getByText('YOUR PROGRESS', { exact: true })).toBeVisible();
    await expect(profile).toHaveAttribute('aria-selected', 'true');
    await expect(sightings).toHaveAttribute('aria-selected', 'false');
    await expect(leaderboard).toHaveAttribute('aria-selected', 'false');
    await sightings.click();
    const canceledPicker = page.waitForEvent('filechooser');
    await add.click();
    await canceledPicker;
    await page.getByTestId('file-input').evaluate(input => input.dispatchEvent(new Event('cancel')));
    await expect(page.getByRole('dialog', { name: 'Log a lanternfly' })).toHaveCount(0);
    const picker = page.waitForEvent('filechooser');
    await add.click();
    await (await picker).setFiles(photo);
    const dialog = page.getByRole('dialog', { name: 'Log a lanternfly' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Report caption' }).fill('Draft caption');
    const replacement = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: /Choose another photo/ }).click();
    await (await replacement).setFiles(photo);
    await expect(dialog.getByRole('textbox', { name: 'Report caption' })).toHaveValue('Draft caption');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    const fresh = page.waitForEvent('filechooser');
    await add.click();
    await (await fresh).setFiles(photo);
    await expect(dialog.getByRole('textbox', { name: 'Report caption' })).toHaveValue('');
    await dialog.getByRole('button', { name: 'Cancel report upload' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}

test('upload errors retain the draft, and a successful retry opens My submissions', async ({ page }) => {
  await page.context().grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await page.context().setGeolocation({ latitude: 37.5017, longitude: -122.254, accuracy: 18 });
  await openApp(page);
  let uploads = 0;
  let releaseUpload: () => void = () => {};
  const pending = new Promise<void>(resolve => { releaseUpload = resolve; });
  await page.route(`${api}/storage/v1/object/report-photos/**`, async route => {
    uploads++;
    if (uploads === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: '400', error: 'Upload failed', message: 'Please retry this upload' }) });
    await pending;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: 'fixture.jpg' }) });
  });
  const submittedLocations: Record<string, unknown>[] = [];
  await page.route(`${api}/rest/v1/rpc/submit_report_with_approximate_location`, route => {
    submittedLocations.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify('11111111-1111-1111-1111-111111111111') });
  });
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add a photo', exact: true }).click();
  await (await picker).setFiles(photo);
  const dialog = page.getByRole('dialog', { name: 'Log a lanternfly' });
  const approximateSharingSwitch = dialog.getByRole('switch', { name: 'Share approximate location on the community map' });
  await expect(approximateSharingSwitch).not.toBeChecked();
  await approximateSharingSwitch.check();
  await expect(approximateSharingSwitch).toBeChecked();
  await expect(page.getByTitle('Approximate public map pin preview')).toBeVisible();
  await expect(page.getByText(/rounded location will be shared/)).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Report caption' }).fill('Keep my draft');
  await dialog.getByRole('button', { name: 'Submit report' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please retry this upload');
  await expect(dialog.getByRole('textbox', { name: 'Report caption' })).toHaveValue('Keep my draft');
  await dialog.getByRole('button', { name: 'Submit report' }).click();
  await expect.poll(() => uploads).toBe(2);
  await expect(dialog.getByRole('button', { name: 'Cancel report upload' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  releaseUpload();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'My submissions', exact: true })).toHaveAttribute('aria-selected', 'true');
  const submittedLocation = submittedLocations[submittedLocations.length - 1];
  expect(submittedLocation).toMatchObject({
    p_latitude: 37.5,
    p_longitude: -122.25,
    p_share_approximate: true,
  });
  expect(uploads).toBe(2);
});

test('a report can be submitted without requesting location or sharing a map pin', async ({ page }) => {
  await openApp(page);
  const submittedLocations: Record<string, unknown>[] = [];
  await page.route(`${api}/storage/v1/object/report-photos/**`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Key: 'fixture.jpg' }) }));
  await page.route(`${api}/rest/v1/rpc/submit_report_with_approximate_location`, route => {
    submittedLocations.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify('22222222-2222-2222-2222-222222222222') });
  });
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add a photo', exact: true }).click();
  await (await picker).setFiles(photo);
  const dialog = page.getByRole('dialog', { name: 'Log a lanternfly' });
  await expect(dialog.getByRole('switch', { name: 'Share approximate location on the community map' })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Submit report' }).click();
  await expect(dialog).toHaveCount(0);
  const submittedLocation = submittedLocations[submittedLocations.length - 1];
  expect(submittedLocation).toMatchObject({
    p_share_approximate: false,
    p_latitude: null,
    p_longitude: null,
  });
});
