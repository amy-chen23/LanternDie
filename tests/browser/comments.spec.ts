import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const viewer = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const author = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const commenter = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const reportId = '11111111-1111-1111-1111-111111111111';

for (const width of [390, 1440]) {
  test(`comments load, paginate, persist, retry and delete across feed/profile at ${width}px`, async ({ page }, testInfo) => {
    test.skip(!api, 'Requires the public Supabase URL; all API requests are mocked.');
    await page.setViewportSize({ width, height: 900 });
    const user = { id: viewer, aud: 'authenticated', role: 'authenticated', email: 'writer@example.invalid', user_metadata: { display_name: 'Writer' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
    const projectRef = new URL(api).hostname.split('.')[0];
    const payload = Buffer.from(JSON.stringify({ sub: viewer, exp: 4102444800, role: 'authenticated' })).toString('base64url');
    await page.addInitScript(({ projectRef, user, payload }) => {
      localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
    }, { projectRef, user, payload });
    let comments = Array.from({ length: 21 }, (_, index) => ({ id: `10000000-0000-0000-0000-${String(index).padStart(12, '0')}`, report_id: reportId, author_id: commenter, body: `Existing comment ${index}`, created_at: new Date(Date.UTC(2026, 10, 1, 0, 0, 24 - index)).toISOString() }));
    let commentReads = 0;
    let failLoad = true;
    let loseFirstPostResponse = true;
    const inserts: string[] = [];
    await page.route(`${api}/**`, async route => {
      const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
      const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
      const fail = (status: number, code: string) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code, message: 'Simulated failure' }) });
      if (url.pathname.endsWith('/auth/v1/user')) return json(user);
      if (name === 'get_profile_field_points') return json(0);
      if (name === 'report_comments') {
        if (req.method() === 'GET') {
          commentReads++;
          if (failLoad) { failLoad = false; return fail(500, 'XX000'); }
          if (url.searchParams.has('id')) return json(comments.find(row => `eq.${row.id}` === url.searchParams.get('id')));
          expect(url.searchParams.get('report_id')).toBe(`eq.${reportId}`);
          const before = url.searchParams.get('or')?.match(/created_at\.lt\.([^,]+)/)?.[1];
          const rows = comments.filter(row => !before || row.created_at < before).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          return json(rows.slice(0, Number(url.searchParams.get('limit') ?? 21)));
        }
        if (req.method() === 'POST') {
          const body = req.postDataJSON();
          expect(body.author_id).toBe(viewer);
          expect(body.report_id).toBe(reportId);
          expect(body.body).toBe('Great sighting!');
          inserts.push(body.id);
          if (comments.some(row => row.id === body.id)) return fail(409, '23505');
          const row = { ...body, created_at: '2026-11-20T00:00:00Z' };
          comments.unshift(row);
          if (loseFirstPostResponse) { loseFirstPostResponse = false; return fail(500, 'XX000'); }
          return json(row);
        }
        if (req.method() === 'DELETE') {
          const row = comments.find(row => `eq.${row.id}` === url.searchParams.get('id'))!;
          expect(row.author_id).toBe(viewer);
          comments = comments.filter(item => item.id !== row.id);
          return json([{ id: row.id }]);
        }
      }
      if (name === 'community_profiles') return json(url.searchParams.get('user_id') === `eq.${author}`
        ? { display_name: 'Post Author' }
        : [{ user_id: author, display_name: 'Post Author' }, { user_id: viewer, display_name: 'Writer' }, { user_id: commenter, display_name: 'Commenter' }]);
      if (name === 'reports') return json(url.searchParams.get('user_id') === `eq.${viewer}` ? [] : [{ id: reportId, user_id: author, photo_path: `${author}/photo.jpg`, observed_on: '2026-11-01', created_at: '2026-11-01T00:00:00Z', caption: 'A sighting with comments', visibility: 'public', workflow_status: 'published', insects_ready: false, upvotes: 0, downvotes: 0 }]);
      return json([]);
    });
    await page.goto('/');
    const tile = page.getByTestId(`sighting-${reportId}`);
    await expect(tile.getByRole('button', { name: 'Comments', exact: true })).toBeVisible();
    expect(commentReads).toBe(0);
    await tile.getByRole('button', { name: 'Comments', exact: true }).click();
    await expect(tile.getByText('Could not load comments. Try refreshing.', { exact: true })).toBeVisible();
    await tile.getByRole('button', { name: 'Refresh comments', exact: true }).click();
    await expect(tile.getByText('Existing comment 0', { exact: true })).toBeVisible();
    await expect(tile.getByText('Existing comment 20', { exact: true })).toHaveCount(0);
    await tile.getByRole('button', { name: 'Load more comments', exact: true }).click();
    await expect(tile.getByText('Existing comment 20', { exact: true })).toBeVisible();
    await expect(tile.getByRole('button', { name: 'Delete comment' })).toHaveCount(0);
    const input = tile.getByRole('textbox', { name: 'Write a comment' });
    await expect(tile.getByRole('button', { name: 'Post comment', exact: true })).toBeDisabled();
    await input.fill('   ');
    await expect(tile.getByRole('button', { name: 'Post comment', exact: true })).toBeDisabled();
    await input.fill('  Great sighting!  ');
    await tile.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(tile.getByText('Could not post your comment. Your draft is saved here; try again.', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('  Great sighting!  ');
    await tile.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(tile.getByText('Great sighting!', { exact: true })).toHaveCount(1);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toBe(inserts[1]);
    expect(comments.filter(row => row.body === 'Great sighting!')).toHaveLength(1);
    await tile.getByText('Great sighting!', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('post-comments.png') });
    await tile.getByRole('button', { name: 'Hide comments', exact: true }).click();
    await page.getByRole('button', { name: "View Post Author's profile", exact: true }).click();
    const profileTile = page.getByTestId(`profile-sighting-${reportId}`);
    await profileTile.getByRole('button', { name: 'Comments', exact: true }).click();
    await expect(profileTile.getByText('Great sighting!', { exact: true })).toBeVisible();
    await profileTile.getByRole('button', { name: 'Delete comment', exact: true }).click();
    await expect(profileTile.getByText('Great sighting!', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to sightings', exact: true }).click();
    await tile.getByRole('button', { name: 'Comments', exact: true }).click();
    await expect(tile.getByText('Existing comment 0', { exact: true })).toBeVisible();
    await expect(tile.getByText('Great sighting!', { exact: true })).toHaveCount(0);
    expect(comments).toHaveLength(21);
  });
}
