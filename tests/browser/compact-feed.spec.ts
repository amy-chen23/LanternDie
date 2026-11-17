import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ids = ['11111111', '22222222', '33333333', '44444444', '55555555'].map(prefix => `${prefix}-1111-1111-1111-111111111111`);
const captions = ['A lanternfly in the park.', 'This long caption describes a lanternfly sighting in detail. It includes enough text to wrap beyond two lines on phones and desktop. The complete observation should remain available when the reader chooses Show more, and should stay expanded after a feed refresh.', 'Square photo.', 'Unavailable photo.', 'No photo attached.'];
const shapes: Record<string, [number, number]> = { portrait: [80, 160], landscape: [200, 80], square: [100, 100] };

async function openFeed(page: Page) {
  test.skip(!api, 'Requires public config at build time; all API requests are mocked.');
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'compact@example.invalid', user_metadata: { display_name: 'Compact QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const projectRef = new URL(api).hostname.split('.')[0];
  const payload = Buffer.from(JSON.stringify({ sub: owner, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ projectRef, user, payload }) => {
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
  }, { projectRef, user, payload });
  const paths = ['portrait', 'landscape', 'square', 'broken', 'missing'];
  await page.route(`${api}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1)!;
    const json = (body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/auth/v1/user')) return json(user);
    if (url.pathname.includes('/object/list/')) return json([]);
    if (req.method() === 'POST' && url.pathname.includes('/object/sign/report-photos')) {
      return json(req.postDataJSON().paths.map((path: string) => ({ path, signedURL: path.includes('missing') ? null : `/object/sign/report-photos/${path}?token=fixture`, error: path.includes('missing') ? 'Missing image' : null })));
    }
    if (url.pathname.startsWith('/storage/')) {
      const shape = shapes[name.replace('.jpg', '')];
      if (!shape) return route.fulfill({ status: 404, body: '' });
      const [width, height] = shape;
      return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#dcebd5"/><rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#244d31" stroke-width="4"/><circle cx="${width / 2}" cy="${height / 2}" r="20" fill="#f72d33"/></svg>` });
    }
    if (name === 'reports') return json(ids.map((id, index) => ({ id, user_id: owner, created_at: '2026-11-01T00:00:00Z', photo_path: `${owner}/${paths[index]}.jpg`, observed_on: '2026-11-01', place_name: 'Fixture park', caption: captions[index], visibility: 'public', workflow_status: 'published', insects_ready: true, upvotes: 1, downvotes: 0 })));
    if (name === 'community_profiles') return json([{ user_id: owner, display_name: 'Compact QA' }]);
    if (name === 'report_insects') return json(ids.slice(0, 2).map((report_id, index) => ({ id: `${index + 1}1111111-2222-2222-2222-222222222222`, report_id, revision: 1, box: { x: shapes[paths[index]][0] / 2 - 20, y: shapes[paths[index]][1] / 2 - 20, width: 40, height: 40 }, label: 'pending' })));
    if (name === 'report_processing_jobs') return json(ids.map(report_id => ({ report_id, status: 'complete' })));
    return json([]);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Refresh feed' })).toBeVisible();
  await expect(page.getByTestId(`sighting-${ids[0]}`)).toBeVisible();
}

for (const width of [320, 390, 711, 712, 1440]) {
  test(`compact feed preserves images, captions and actions at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openFeed(page);
    const first = page.getByTestId(`sighting-${ids[0]}`);
    await expect(first.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
    await expect(first.getByTestId('feed-caption')).toHaveText(captions[0]);
    for (const id of ids.slice(0, 3)) {
      const card = page.getByTestId(`sighting-${id}`);
      const thumbnail = card.getByRole('button', { name: 'Open photo by Compact QA' });
      await expect(thumbnail).toHaveCSS('width', '144px');
      await expect(thumbnail).toHaveCSS('height', '144px');
      await expect(card.locator('img').last()).toHaveJSProperty('complete', true);
      await expect(card.locator('[style*="background-image"]').last()).toHaveCSS('background-size', 'contain');
    }
    await expect(page.getByText(/^[0-9]+ lanternfl(y|ies) detected$/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /View identification results/ })).toHaveCount(0);
    const grid = page.getByTestId('feed-grid');
    const gridBounds = (await grid.boundingBox())!;
    const twoColumns = width >= 712;
    const expectedWidth = twoColumns ? (gridBounds.width - 24) / 2 : gridBounds.width;
    await expect(first).toHaveCSS('width', `${expectedWidth}px`);
    await expect(first).toHaveCSS('padding', '16px');
    await expect(grid).toHaveCSS('gap', '24px');
    const firstBounds = (await first.boundingBox())!;
    const secondBounds = (await page.getByTestId(`sighting-${ids[1]}`).boundingBox())!;
    const thirdBounds = (await page.getByTestId(`sighting-${ids[2]}`).boundingBox())!;
    if (twoColumns) {
      expect(secondBounds.y).toBeCloseTo(firstBounds.y, 1);
      expect(secondBounds.x - firstBounds.x - firstBounds.width).toBeCloseTo(24, 1);
      expect(thirdBounds.y - Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height)).toBeCloseTo(24, 1);
    } else {
      expect(secondBounds.x).toBe(firstBounds.x);
      expect(secondBounds.y - firstBounds.y - firstBounds.height).toBeCloseTo(24, 1);
    }
    await expect(page.getByTestId(`sighting-${ids[4]}`)).toHaveCSS('width', `${expectedWidth}px`);
    expect((await first.boundingBox())!.height).toBeLessThanOrEqual(352);
    const upvote = first.getByRole('button', { name: 'Upvote report' });
    await expect(upvote).toHaveCSS('height', '44px');
    const photoBounds = (await first.getByRole('button', { name: /Open photo/ }).boundingBox())!;
    const voteBounds = (await upvote.boundingBox())!;
    if (expectedWidth >= 316) {
      expect(voteBounds.y + voteBounds.height).toBeCloseTo(photoBounds.y + photoBounds.height, 1);
      expect(voteBounds.x).toBeGreaterThanOrEqual(photoBounds.x + photoBounds.width);
      expect((await first.boundingBox())!.height).toBeLessThanOrEqual(292);
    } else {
      expect(voteBounds.y).toBeGreaterThanOrEqual(photoBounds.y + photoBounds.height);
    }
    await expect.poll(async () => (await first.locator('[style*="background-image"]').last().boundingBox())!.width).toBeGreaterThan(144);
    await first.getByRole('button', { name: 'Open photo by Compact QA' }).click();
    await expect(page.getByText('PHOTO RESULTS', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close identification results' }).click();

    const longCard = page.getByTestId(`sighting-${ids[1]}`);
    const showMore = longCard.getByRole('button', { name: 'Show more', exact: true });
    await expect(showMore).toBeVisible();
    const collapsed = (await longCard.boundingBox())!.height;
    const collapsedCaption = (await longCard.getByTestId('feed-caption').boundingBox())!.height;
    await showMore.click();
    await expect(longCard.getByRole('button', { name: 'Show less', exact: true })).toHaveAttribute('aria-expanded', 'true');
    expect((await longCard.getByTestId('feed-caption').boundingBox())!.height).toBeGreaterThan(collapsedCaption);
    expect((await longCard.boundingBox())!.height).toBeGreaterThanOrEqual(collapsed);
    await page.getByRole('button', { name: 'Refresh feed' }).click();
    await expect(longCard.getByRole('button', { name: 'Show less', exact: true })).toBeVisible();
    await page.setViewportSize({ width: twoColumns ? 390 : 1440, height: 900 });
    await expect(longCard.getByRole('button', { name: 'Show less', exact: true })).toBeVisible();
    await page.setViewportSize({ width, height: 900 });
    await expect(first).toHaveCSS('width', `${expectedWidth}px`);
    await longCard.getByRole('button', { name: 'Show less', exact: true }).click();
    expect((await longCard.boundingBox())!.height).toBe(collapsed);
    await expect(page.getByTestId(`sighting-${ids[3]}`).getByText('Photo unavailable')).toBeVisible();
    const missing = page.getByTestId(`sighting-${ids[4]}`);
    await expect(missing.getByText('Photo unavailable')).toBeVisible();
    await missing.getByRole('button', { name: 'Open photo results by Compact QA' }).click();
    await expect(page.getByText('PHOTO RESULTS', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close identification results' }).click();
    await page.getByRole('tab', { name: 'My submissions', exact: true }).click();
    const menu = first.getByRole('button', { name: 'Submission options' });
    await expect(menu).toBeVisible();
    await expect.poll(() => menu.evaluate(button => {
      const control = button.getBoundingClientRect();
      const card = button.closest('[data-testid^="sighting-"]')!.getBoundingClientRect();
      return { top: Math.round(control.top - card.top), right: Math.round(card.right - control.right) };
    })).toEqual({ top: 17, right: 17 });
    await menu.click();
    await expect(first.getByRole('button', { name: 'Edit report details' })).toBeVisible();
    await first.getByRole('button', { name: 'Close submission options' }).click({ position: { x: 4, y: 4 } });
    await expect(first.getByRole('button', { name: /Open photo/ })).toHaveCSS('width', '144px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath('compact-feed.png') });
  });
}
