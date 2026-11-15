import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
test.setTimeout(30_000);
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const policy = JSON.parse(readFileSync('assets/models/policy.json', 'utf8'));
const photo = readFileSync('tests/fixtures/browser-inference/above.jpg');
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id = '11111111-1111-1111-1111-111111111111';
const boxes = [{ x: 0, y: 0, width: 135, height: 203 }, { x: 12, y: 9, width: 80, height: 90 }];

async function setup(page: Page) {
  const state = { saves: [] as Record<string, any>[], downloads: 0, assessment: null as Record<string, any> | null, rpcNames: [] as string[] };
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', user_metadata: { display_name: 'Model QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const projectRef = new URL(api).hostname.split('.')[0];
  const payload = Buffer.from(JSON.stringify({ sub: owner, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ projectRef, user, payload }) => {
    localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture-only', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
  }, { projectRef, user, payload });
  // Only Auth/Storage/DB transport is stubbed. The application runs the real ONNX worker.
  await page.route(`${api}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/storage/')) {
      if (request.method() === 'GET') { state.downloads++; return route.fulfill({ contentType: 'image/jpeg', body: photo }); }
      return json([]);
    }
    if (url.pathname.includes('/rpc/')) {
      state.rpcNames.push(name!);
      if (name === 'get_my_admin_status') return json(false);
      if (name === 'touch_member_activity') return json(null);
      if (name !== 'save_death_assessment') throw Error(`Unexpected mutation RPC: ${name}`);
      const args = request.postDataJSON(); state.saves.push(args);
      state.assessment = { report_id: id, detector_updated_at: args.p_detector_updated_at, model_sha256: args.p_model_sha256, status: args.p_status, scores: args.p_scores, threshold: policy.threshold, route: 'community_verification', updated_at: new Date().toISOString() };
      return json(null);
    }
    if (name === 'reports') return json([{ id, user_id: owner, created_at: '2026-11-01T00:00:00Z', photo_path: `${owner}/fixture.jpg`, observed_on: '2026-11-01', caption: 'Real model fixture', visibility: 'public', upvotes: 1, downvotes: 0, workflow_status: 'pending_review', insects_ready: true }]);
    if (name === 'community_profiles') return json([{ user_id: owner, display_name: 'Model QA' }]);
    if (name === 'report_identifications') return json([{ report_id: id, status: 'detected', image_width: 135, image_height: 203, detections: boxes, updated_at: '2026-11-01T00:00:00Z' }]);
    if (name === 'report_insects') return json(boxes.map((box, index) => ({ id: `22222222-2222-2222-2222-${String(index + 1).padStart(12, '0')}`, report_id: id, revision: 1, active: true, label: 'pending', box })));
    if (name === 'report_processing_jobs') return json([{ report_id: id, status: 'complete', attempts: 1 }]);
    if (name === 'report_death_assessments') return json(state.assessment ? [state.assessment] : []);
    return json([]);
  });
  return state;
}
async function openOwnerReports(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'View my submissions' }).click();
  await expect(page.getByText('2 UNCERTAIN lanternflies detected', { exact: true })).toBeVisible();
}

test('actual model predictions persist once and update cards plus an already-open modal, without verification or credit', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; all hosted requests are intercepted.');
  const state = await setup(page);
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let modelLoads = 0;
  await page.route('**/inference/lanternfly-dead.onnx', async route => { modelLoads++; await ready; await route.continue(); });
  await openOwnerReports(page);
  await page.getByRole('button', { name: 'View identification results for sighting by Model QA: Results' }).click();
  await expect(page.getByText('PHOTO RESULTS', { exact: true })).toBeVisible();
  // Wait until the actual inference path has requested its graph; then release it.
  await expect.poll(() => modelLoads).toBe(1); release();
  await expect(page.getByRole('heading', { name: '1 LIKELY DEAD lanternfly and 1 UNCERTAIN lanternfly detected' })).toBeVisible();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].p_status).toBe('complete');
  expect(state.saves[0].p_model_sha256).toBe(policy.modelSha256);
  expect(Math.abs(state.saves[0].p_scores[0] - 0.9997138381004333)).toBeLessThan(0.00001);
  expect(Math.abs(state.saves[0].p_scores[1] - 0.9795925617218018)).toBeLessThan(0.00001);
  await page.getByRole('button', { name: 'Close identification results' }).click();
  await expect(page.getByText('1 LIKELY DEAD lanternfly and 1 UNCERTAIN lanternfly detected', { exact: true })).toBeVisible();
  await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible();
  await expect(page.getByText('Real model fixture', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'View my submissions' }).click();
  await expect(page.getByText('1 LIKELY DEAD lanternfly and 1 UNCERTAIN lanternfly detected', { exact: true })).toBeVisible();
  await page.waitForTimeout(1800); // Exceeds the 1500ms initialization delay: cached predictions must not re-run.
  expect(state.saves).toHaveLength(1); expect(state.downloads).toBe(1); expect(modelLoads).toBe(1);
  expect(state.rpcNames.every(name => ['get_my_admin_status', 'touch_member_activity', 'save_death_assessment'].includes(name))).toBe(true);
});

test('model-loading failure stays uncertain, survives a remount without an automatic loop, and explicit retry uses real inference', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; all hosted requests are intercepted.');
  const state = await setup(page); let missing = true;
  await page.route('**/inference/lanternfly-dead.onnx', route => missing ? route.fulfill({ status: 404, body: 'missing' }) : route.continue());
  await openOwnerReports(page);
  await expect(page.getByRole('alert')).toContainText('Photo check failed');
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].p_status).toBe('failed'); expect(state.saves[0].p_scores).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'View my submissions' }).click();
  await expect(page.getByRole('alert')).toContainText('Photo check failed');
  await page.waitForTimeout(1800); expect(state.saves).toHaveLength(1);
  missing = false;
  await page.getByRole('button', { name: 'Retry photo check', exact: true }).click();
  await expect(page.getByText('1 LIKELY DEAD lanternfly and 1 UNCERTAIN lanternfly detected', { exact: true })).toBeVisible();
  expect(state.saves).toHaveLength(2); expect(state.saves[1].p_status).toBe('complete');
});
