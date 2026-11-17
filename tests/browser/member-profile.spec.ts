import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

for (const width of [390, 1440]) {
test(`member profile tiles and voting work at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
  const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
  test.skip(!api, 'Requires a public Supabase URL; all requests are mocked.');
  const viewer = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const author = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const user = { id: viewer, aud: 'authenticated', role: 'authenticated', email: 'viewer@example.invalid', user_metadata: { display_name: 'Viewer' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const projectRef = new URL(api).hostname.split('.')[0];
  const payload = Buffer.from(JSON.stringify({ sub: viewer, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ projectRef, user, payload }) => {
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
  }, { projectRef, user, payload });
  let authorQuery = false;
  let pointsRequests = 0;
  let myVote = 0;
  let failNextVote = false;
  const counts = () => ({ upvotes: 2 + Number(myVote === 1), downvotes: 1 + Number(myVote === -1) });
  await page.route(`${api}/**`, async route => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (route.request().method() === 'POST' && url.pathname.includes('/object/sign/profile-photos')) {
      const body = route.request().postDataJSON();
      return json((body.paths ?? []).map((path: string) => ({ path, signedURL: `/object/sign/profile-photos/${path}?token=fixture`, error: null })));
    }
    if (route.request().method() === 'POST' && url.pathname.includes('/object/sign/report-photos')) {
      return json(route.request().postDataJSON().paths.map((path: string) => ({ path, signedURL: `/object/sign/report-photos/${path}?token=fixture`, error: null })));
    }
    if (route.request().method() === 'GET' && url.pathname.includes('/object/sign/')) {
      return route.fulfill({ contentType: 'image/jpeg', body: readFileSync('tests/fixtures/browser-inference/above.jpg') });
    }
    if (url.pathname.endsWith('/auth/v1/user')) return json(user);
    if (name === 'get_my_admin_status') return json(false);
    if (name === 'get_profile_field_points') {
      expect(route.request().postDataJSON()).toEqual({ profile_user_id: author });
      if (++pointsRequests === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary failure' }) });
      return json(-7 + myVote);
    }
    if (name === 'report_votes') {
      const req = route.request();
      if (req.method() === 'GET') return json(url.searchParams.has('report_id') && url.searchParams.get('report_id')?.startsWith('eq.')
        ? myVote ? { value: myVote } : null
        : myVote ? [{ report_id: '11111111-1111-1111-1111-111111111111', value: myVote }] : []);
      if (failNextVote) {
        failNextVote = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Vote failed' }) });
      }
      myVote = req.method() === 'DELETE' ? 0 : req.postDataJSON().value;
      return json(null);
    }
    if (name === 'community_profiles') return json(url.searchParams.get('user_id') === `eq.${author}`
      ? { display_name: 'Feed Author' } : [{ user_id: author, display_name: 'Feed Author' }]);
    if (name === 'reports') {
      if (url.searchParams.has('id')) return json(counts());
      if (url.searchParams.get('user_id') === `eq.${viewer}`) return json([]);
      if (url.searchParams.get('user_id') === `eq.${author}`) {
        authorQuery = true;
        expect(url.searchParams.get('visibility')).toBe('eq.public');
      }
      return json([{ id: '11111111-1111-1111-1111-111111111111', user_id: author, photo_path: `${author}/photo.jpg`, created_at: '2026-11-01T00:00:00Z', observed_on: '2026-11-01', caption: 'A public sighting', place_name: 'Park', visibility: 'public', workflow_status: 'published', insects_ready: false, ...counts() }]);
    }
    return json([]);
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sightings', exact: true }).click();
  await page.getByText('Feed Author', { exact: true }).click();
  await expect(page.getByText('RECENT PUBLIC SIGHTINGS', { exact: true })).toBeVisible();
  await expect(page.getByText('FIELD POINTS', { exact: true }).locator('..').getByText('Unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry loading field points' }).click();
  await expect(page.getByText('FIELD POINTS', { exact: true }).locator('..').getByText('-7', { exact: true })).toBeVisible();
  const tile = page.getByTestId('profile-sighting-11111111-1111-1111-1111-111111111111');
  const points = page.getByText('FIELD POINTS', { exact: true }).locator('..');
  await expect(tile.getByRole('button', { name: 'Open photo by Feed Author' })).toHaveCSS('width', '144px');
  await expect(tile.getByRole('button', { name: 'Open photo by Feed Author' })).toHaveCSS('height', '144px');
  await expect(tile.getByLabel('Score 1', { exact: true })).toBeVisible();
  await tile.getByRole('button', { name: 'Upvote report', exact: true }).click();
  await expect(tile.getByLabel('Score 2', { exact: true })).toBeVisible();
  await expect(points.getByText('-6', { exact: true })).toBeVisible();
  await tile.getByRole('button', { name: 'Downvote report', exact: true }).click();
  await expect(tile.getByLabel('Score 0', { exact: true })).toBeVisible();
  await expect(points.getByText('-8', { exact: true })).toBeVisible();
  await tile.getByRole('button', { name: 'Downvote report', exact: true }).click();
  await expect(tile.getByLabel('Score 1', { exact: true })).toBeVisible();
  await expect(points.getByText('-7', { exact: true })).toBeVisible();
  failNextVote = true;
  await tile.getByRole('button', { name: 'Upvote report', exact: true }).click();
  await expect(page.getByText('Could not save your vote. Please try again.', { exact: true })).toBeVisible();
  await expect(tile.getByLabel('Score 1', { exact: true })).toBeVisible();
  await tile.getByRole('button', { name: 'Upvote report', exact: true }).click();
  await expect(points.getByText('-6', { exact: true })).toBeVisible();
  await tile.getByRole('button', { name: 'Open photo by Feed Author' }).click();
  await expect(page.getByText('PHOTO RESULTS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close identification results' }).click();
  await expect(page.getByText('viewer@example.invalid', { exact: false })).toHaveCount(0);
  expect(authorQuery).toBe(true);
  await page.getByRole('button', { name: 'Back to sightings', exact: true }).click();
  await expect(page.getByText('RECENT PUBLIC SIGHTINGS', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: "View Feed Author's profile" })).toBeVisible();
  await expect(page.getByTestId('sighting-11111111-1111-1111-1111-111111111111').getByLabel('Score 2', { exact: true })).toBeVisible();
  await page.getByRole('img', { name: "Feed Author's profile photo", exact: true }).click();
  await expect(page.getByText('RECENT PUBLIC SIGHTINGS', { exact: true })).toBeVisible();
});
}
