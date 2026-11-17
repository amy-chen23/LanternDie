import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
test.setTimeout(30_000);
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const photo = readFileSync('tests/fixtures/browser-inference/above.jpg');
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id = '11111111-1111-1111-1111-111111111111';
const boxes = [{ x: 0, y: 0, width: 135, height: 203 }, { x: 12, y: 9, width: 80, height: 90 }];

async function setup(page: Page) {
  const state = { rpcNames: [] as string[], classifierCalls: [] as string[], detectionStatus: 'detected', failed: false, retries: 0 };
  page.on('request', request => { if (/\/inference\/|\.onnx|\.wasm|report_death_assessments|save_death_assessment|report_verification_votes/.test(request.url())) state.classifierCalls.push(request.url()); });
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', user_metadata: { display_name: 'Detector QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const projectRef = new URL(api).hostname.split('.')[0];
  const payload = Buffer.from(JSON.stringify({ sub: owner, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ projectRef, user, payload }) => {
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
  }, { projectRef, user, payload });
  // Only Auth/Storage/DB transport is stubbed. The app consumes existing Roboflow detector results; no classifier may run.
  await page.route(`${api}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/storage/')) {
      if (request.method() === 'GET') { return route.fulfill({ contentType: 'image/jpeg', body: photo }); }
      if (url.pathname.includes('/object/sign/report-photos')) return json(request.postDataJSON().paths.map((path: string) => ({path,signedURL:`/object/sign/report-photos/${path}?token=fixture`,error:null})));
      return json([]);
    }
    if (url.pathname.includes('/rpc/')) {
      state.rpcNames.push(name!);
      if (name === 'get_my_admin_status') return json(false);
      if (name === 'touch_member_activity') return json(null);
      if (name === 'retry_report_processing') {
        expect(request.postDataJSON()).toEqual({ p_report_id: id });
        state.retries++; state.failed = false; state.detectionStatus = 'detected';
        return json(null);
      }
      throw Error(`Unexpected mutation RPC: ${name}`);
    }
    if (name === 'reports') return json([{ id, user_id: owner, created_at: '2026-11-01T00:00:00Z', photo_path: `${owner}/fixture.jpg`, observed_on: '2026-11-01', caption: 'Detector-only fixture', visibility: 'public', upvotes: 1, downvotes: 0, workflow_status: state.failed ? 'admin_review' : 'pending_review', insects_ready: state.detectionStatus === 'detected' }]);
    if (name === 'community_profiles') return json([{ user_id: owner, display_name: 'Detector QA' }]);
    if (name === 'report_identifications') return json([{ report_id: id, status: state.detectionStatus, image_width: 135, image_height: 203, detections: state.detectionStatus === 'detected' ? boxes : [], updated_at: '2026-11-01T00:00:00Z' }]);
    if (name === 'report_insects') return json((state.detectionStatus === 'detected' ? boxes : []).map((box, index) => ({ id: `22222222-2222-2222-2222-${String(index + 1).padStart(12, '0')}`, report_id: id, revision: 1, active: true, label: 'pending', box })));
    if (name === 'report_processing_jobs') return json([{ report_id: id, status: state.failed ? 'failed' : 'complete', attempts: 1 }]);
    if (['report_death_assessments', 'report_verification_votes', 'save_death_assessment'].includes(name ?? '')) return route.fulfill({status:500,body:'Classifier is unavailable and must not be queried'});
    return json([]);
  });
  return state;
}
async function openOwnerReports(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'My submissions', exact: true }).click();
}

test('owner detector results remain counts and boxes after refresh, with no classifier requests', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL; all hosted requests are intercepted.');
  const state = await setup(page);
  await openOwnerReports(page);
  await expect(page.getByText('2 lanternflies detected', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', {name:'Sighting by Detector QA',exact:true})).toBeVisible();
  await expect(page.getByText(/^(Approved|Awaiting approval)$/)).toHaveCount(0);
  await page.getByRole('button', { name: 'View identification results for sighting by Detector QA: Results' }).click();
  await expect(page.getByRole('heading', { name: '2 lanternflies detected', exact: true })).toBeVisible();
  await expect(page.getByText('1. Lanternfly', { exact: true })).toBeVisible();
  await expect(page.getByText('2. Lanternfly', { exact: true })).toBeVisible();
  await expect(page.getByText(/Detection threshold:/)).toHaveCount(0);
  await expect(page.getByText(/alive or dead|Community votes|Awaiting.*review/)).toHaveCount(0);
  await expect(page.getByText(/LIKELY DEAD|Retry photo check|Checking photo…/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close identification results' }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'My submissions', exact: true }).click();
  await expect(page.getByText('2 lanternflies detected', { exact: true })).toBeVisible();
  await page.waitForTimeout(1800); // Regression: used to schedule the classifier after 1500ms.
  expect(state.classifierCalls).toEqual([]);
  expect(state.rpcNames).toEqual([]);
});

test('no lanternfly detections show the existing no-detection result, without classification', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL; all hosted requests are intercepted.');
  const state = await setup(page); state.detectionStatus = 'not_detected';
  await openOwnerReports(page);
  await page.getByRole('button', { name: 'View identification results for sighting by Detector QA: Results' }).click();
  await expect(page.getByText('No lanternfly detected', { exact: true }).first()).toBeVisible();
  expect(state.classifierCalls).toEqual([]);
});

test('failed background detection retains its existing retry path without running another model', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL; all hosted requests are intercepted.');
  const state = await setup(page); state.detectionStatus = 'failed'; state.failed = true;
  await openOwnerReports(page);
  await page.getByRole('button', { name: 'Retry background checks', exact: true }).click();
  await expect(page.getByText('2 lanternflies detected', { exact: true })).toBeVisible();
  expect(state.retries).toBe(1);
  expect(state.classifierCalls).toEqual([]);
});
