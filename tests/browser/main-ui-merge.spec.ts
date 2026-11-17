import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Fake Auth/REST only in the browser test; no request reaches a hosted database.
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const reportId = '11111111-1111-1111-1111-111111111111';
const aliveReportId = '33333333-3333-3333-3333-333333333333';
const insectId = '22222222-2222-2222-2222-222222222222';
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const projectRef = new URL(api || 'https://fixture.supabase.co').hostname.split('.')[0];
const fixturePhoto = readFileSync('tests/fixtures/browser-inference/above.jpg');

test('main Sightings UI preserves filters, owner actions, avatars and results with detector-only results', async ({ page }) => {
  test.skip(!api, 'Authenticated UI checks require the public Supabase URL configured at web-build time; requests are fully mocked.');
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'qa@example.invalid', user_metadata: { display_name: 'Merge QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const payload = Buffer.from(JSON.stringify({ sub: owner, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ projectRef, user, payload }) => {
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
  }, { projectRef, user, payload });
  const calls: { method: string; path: string }[] = [];
  const fixture = { caption: 'Merged caption', deleted: false };
  await page.route(`${api}/**`, async route => {
    const req = route.request(), url = new URL(req.url());
    calls.push({ method: req.method(), path: url.pathname });
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/auth/v1/user')) return json(user);
    if (req.method() === 'POST' && url.pathname.includes('/object/sign/profile-photos')) {
      const body = req.postDataJSON();
      return json((body.paths ?? []).map((path: string) => ({ path, signedURL: '/object/sign/profile-photos/avatar.jpg?token=fixture', error: null })));
    }
    if (url.pathname.includes('/object/list/')) return json([]);
    if (url.pathname.startsWith('/storage/') && req.method() === 'DELETE') return json([]);
    if (req.method() === 'POST' && url.pathname.includes('/object/sign/report-photos')) {
      return json(req.postDataJSON().paths.map((path: string) => ({ path, signedURL: `/object/sign/report-photos/${path}?token=fixture`, error: null })));
    }
    if (url.pathname.startsWith('/storage/') && req.method() === 'GET') return route.fulfill({ contentType: 'image/jpeg', body: fixturePhoto });
    const name = url.pathname.split('/').at(-1);
    if (['report_death_assessments', 'report_verification_votes', 'save_death_assessment'].includes(name ?? '')) throw Error('Classifier data must not be requested');
    if (name === 'get_my_admin_status') return json(false);
    if (name === 'reports') {
      if (req.method() === 'PATCH') { fixture.caption = req.postDataJSON().caption; return json(null); }
      if (req.method() === 'DELETE') { fixture.deleted = true; return json({ photo_path: `${owner}/fixture.jpg` }); }
      const deadReport = { id: reportId, user_id: owner, created_at: '2026-11-01T00:00:00Z', photo_path: `${owner}/fixture.jpg`, observed_on: '2026-11-01', place_name: 'Fixture park', caption: fixture.caption, visibility: 'public', upvotes: 1, downvotes: 0, flagged_inaccurate: false, workflow_status: 'published', insects_ready: true };
      return json([...(fixture.deleted ? [] : [deadReport]), { ...deadReport, id: aliveReportId, photo_path: `${owner}/alive.jpg`, caption: 'Alive-only fixture', upvotes: 0 }, { ...deadReport, id: '55555555-5555-5555-5555-555555555555', caption: 'Rejected fixture', workflow_status: 'rejected', insects_ready: false, upvotes: 0 }]);
    }
    if (name === 'community_profiles') return json([{ user_id: owner, display_name: 'Merge QA' }]);
    if (name === 'report_identifications') return json([{ report_id: reportId, status: 'detected', model_id: 'fixture', confidence_threshold: 0.5, image_width: 135, image_height: 203, detections: [{ x: 0, y: 0, width: 135, height: 203 }], updated_at: '2026-11-01T00:00:00Z' }]);
    if (name === 'report_insects') return json([{ id: insectId, report_id: reportId, revision: 1, active: true, box: { x: 0, y: 0, width: 135, height: 203 }, label: 'dead' }, { id: '44444444-4444-4444-4444-444444444444', report_id: aliveReportId, revision: 1, active: true, box: { x: 0, y: 0, width: 135, height: 203 }, label: 'alive' }]);
    if (name === 'report_kill_credits') return json([{ report_id: reportId, dead_insects: 1 }]);
    if (name === 'report_processing_jobs') return json([{ report_id: reportId, status: 'complete', attempts: 1 }]);
    if (name === 'report_votes') return json([{ report_id: reportId, value: 1 }]);
    return json([]);
  });
  const errors: string[] = [];
  const svgWarnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /accessibilityElementsHidden|accessibilityelementshidden/.test(message.text())) svgWarnings.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('tab', { name: 'My submissions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter submissions by status: All' })).toBeVisible();
  await expect(page.getByText('1 lanternfly detected', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Merged caption' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sighting by Merge QA', exact: true }).first()).toBeVisible();
  await expect.poll(() => page.locator('img[src*="/object/sign/report-photos/"]').first()
    .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByText(/^(Approved|Awaiting approval)$/)).toHaveCount(0);
  await expect(page.getByTestId(`sighting-${reportId}`)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByTestId(`sighting-${aliveReportId}`)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByTestId('sighting-55555555-5555-5555-5555-555555555555')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('img', { name: "Merge QA's profile photo" }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upvote report', exact: true }).first()).toBeEnabled();
  await page.getByRole('button', { name: 'Open photo by Merge QA' }).first().click();
  await expect(page.getByText('PHOTO RESULTS', { exact: true })).toBeVisible();
  await expect(page.getByText('1. Lanternfly', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close identification results' }).click();
  await page.getByRole('button', { name: 'Filter submissions by status: All' }).click();
  await expect(page.getByRole('menuitem', { name: 'Earned Points', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'No Points', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Pending', exact: true }).click();
  await expect(page.getByText('No pending submissions', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filter submissions by status: Pending' }).click();
  await page.getByRole('menuitem', { name: 'Earned Points', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filter submissions by status: Earned Points' })).toBeVisible();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Alive-only fixture' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Submission options', exact: true }).click();
  await page.getByRole('button', { name: 'Edit report details', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Report caption' })).toHaveValue('Merged caption');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Submission options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete submission', exact: true }).click();
  await expect(page.getByText('Delete this submission?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Filter submissions by status: Earned Points' }).click();
  await page.getByRole('menuitem', { name: 'No Points', exact: true }).click();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Alive-only fixture' })).toBeVisible();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Merged caption' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Needs review', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Merged caption' })).toBeVisible();
  await page.getByRole('tab', { name: 'My Profile', exact: true }).click();
  await expect(page.getByText('FIELD POINTS', { exact: true }).locator('..').getByText('1', { exact: true })).toBeVisible();
  // Exercise the merged edit/delete flows through real UI handlers; transport is local.
  await page.getByRole('tab', { name: 'Sightings', exact: true }).click();
  await page.getByRole('tab', { name: 'My submissions', exact: true }).click();
  await page.getByRole('button', { name: 'Filter submissions by status: No Points' }).click();
  await page.getByRole('menuitem', { name: 'Earned Points', exact: true }).click();
  await page.getByRole('button', { name: 'Submission options', exact: true }).click();
  await page.getByRole('button', { name: 'Edit report details', exact: true }).click();
  await page.getByRole('textbox', { name: 'Report caption' }).fill('Edited caption survives refresh');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Edited caption survives refresh' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sighting by Merge QA', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Submission options', exact: true }).click();
  await page.getByRole('button', { name: 'Delete submission', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete submission', exact: true }).click();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Edited caption survives refresh' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Explore', exact: true }).click();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Alive-only fixture' })).toBeVisible();
  await expect(page.getByTestId('feed-caption').filter({ hasText: 'Edited caption survives refresh' })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(svgWarnings).toEqual([]);
  expect(calls.filter(call => call.method === 'PATCH')).toHaveLength(1);
  expect(calls.filter(call => call.method === 'DELETE')).toHaveLength(2);
});
