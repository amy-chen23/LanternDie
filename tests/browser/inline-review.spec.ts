import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
test.setTimeout(30_000);
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const viewer = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', author = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id = '11111111-1111-1111-1111-111111111111';
const photo = readFileSync('tests/fixtures/browser-inference/above.jpg');
const policy = JSON.parse(readFileSync('assets/models/policy.json', 'utf8'));
async function setup(page: Page, { own = false, count = 1, finalizes = false, approved = false } = {}) {
  const state = { claims: 0, releases: 0, saves: [] as any[], deny: false, full: false, final: approved, summaryCalls: 0, summaryError: false,
    rows: Array.from({ length: count }, (_, index) => ({ insect_id: `22222222-2222-2222-2222-${String(index + 1).padStart(12, '0')}`, revision: 1,
      box: { x: index * 10, y: 0, width: 80, height: 100 }, final_label: (approved ? (index === 0 ? 'dead' : 'alive') : null) as string | null, my_vote: null as string | null, can_vote: false, feedback: null })) };
  const user = { id: viewer, aud: 'authenticated', role: 'authenticated', email: 'reviewer@example.invalid', user_metadata: { display_name: 'Review QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const ref = new URL(api).hostname.split('.')[0], payload = Buffer.from(JSON.stringify({ sub: viewer, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ ref, user, payload }) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user })), { ref, user, payload });
  await page.route(`${api}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
    const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/storage/')) {
      if (req.method() === 'GET') return route.fulfill({ contentType: 'image/jpeg', body: photo });
      if (url.pathname.includes('/object/sign/report-photos')) return json([{ path: `${author}/fixture.jpg`, signedURL: '/object/sign/report-photos/fixture.jpg?token=test', error: null }]);
      return json([]);
    }
    if (url.pathname.includes('/rpc/')) {
      if (name === 'get_my_admin_status') return json(false);
      if (name === 'touch_member_activity') return json(null);
      if (name === 'get_report_vote_summary') {
        state.summaryCalls++;
        if (state.summaryError) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Unavailable'})});
        const approvedResults = state.final && state.rows.every(row => row.final_label !== null);
        return json(state.rows.map((row, index) => ({insect_id:row.insect_id,revision:row.revision,final_label:row.final_label,
          alive_votes: approvedResults ? (index === 0 ? 1 : 0) : row.my_vote ? Number(row.my_vote === 'alive') : null,
          dead_votes: approvedResults ? (index === 0 ? 3 : 0) : row.my_vote ? Number(row.my_vote === 'dead') : null,
          uncertain_votes: approvedResults ? (index === 0 ? 2 : 0) : row.my_vote ? Number(row.my_vote === 'uncertain') : null})));
      }
      if (name === 'get_report_review') return json(state.rows);
      if (name === 'claim_report_review') { state.claims++; return json(state.rows.map(row => ({ ...row, can_vote: !state.full }))); }
      if (name === 'release_report_review') { state.releases++; return json(null); }
      if (name === 'set_insect_review_vote') {
        if (state.deny) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'Insect changed' }) });
        const args = req.postDataJSON(); state.saves.push(args);
        state.rows = state.rows.map(row => row.insect_id === args.p_insect_id ? { ...row, my_vote: args.p_label, final_label: finalizes ? args.p_label : null } : row);
        if (finalizes) state.final = true;
        return json(null);
      }
      throw Error(`Unexpected RPC: ${name}`);
    }
    const report = { id, user_id: own ? viewer : author, created_at: '2026-11-01T00:00:00Z', photo_path: `${author}/fixture.jpg`, observed_on: '2026-11-01', caption: 'The post stays', visibility: 'public', upvotes: 1, downvotes: 0, workflow_status: state.final ? 'published' : 'pending_review', insects_ready: true };
    if (name === 'reports') return json(url.searchParams.has('user_id') && !own ? [] : [report]);
    if (name === 'report_verification_queue') return json(own || state.final ? [] : [report]);
    if (name === 'community_profiles') return json([{ user_id: report.user_id, display_name: 'Author QA' }]);
    if (name === 'report_insects') return json(state.rows.map(row => ({ id: row.insect_id, report_id: id, revision: row.revision, box: row.box, label: row.final_label ?? 'pending' })));
    if (name === 'report_identifications') return json([{ report_id: id, status: 'detected', image_width: 135, image_height: 203, detections: state.rows.map(row => row.box), updated_at: '2026-11-01T00:00:00Z' }]);
    if (name === 'report_processing_jobs') return json([{ report_id: id, status: 'complete' }]);
    if (name === 'report_death_assessments' && approved) return json([{ report_id:id, status:'complete', model_sha256:policy.modelSha256,
      detector_updated_at:'2026-11-01T00:00:00Z', threshold:policy.threshold, scores:state.rows.map(() => 0.999) }]);
    if (name === 'report_kill_credits') return json(state.final ? [{ report_id: id, dead_insects: 1 }] : []);
    return json([]);
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sightings', exact: true }).click();
  return state;
}

test('Explore response claims only on click, says Thanks, hides the prompt and retains the finalized post', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page, { finalizes: true });
  await expect(page.getByRole('heading', { name: 'Is this lanternfly alive or dead?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Answer dead', exact: true })).toBeEnabled();
  expect(state.claims).toBe(0);
  await page.getByRole('button', { name: 'Answer dead', exact: true }).dblclick();
  await expect(page.getByText('Thanks!', { exact: true })).toBeVisible();
  expect(state.saves).toHaveLength(1); expect(state.saves[0]).toMatchObject({ p_insect_id: state.rows[0].insect_id, p_revision: 1, p_label: 'dead' });
  await expect(page.getByText('Thanks!', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Is this lanternfly alive or dead?' })).toHaveCount(0);
  await expect(page.getByText('The post stays', { exact: true })).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect.poll(() => state.releases).toBeGreaterThan(0);
});
test('uncertain response applies to one insect only; another can be reviewed and responses stay dismissed after reload', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page, { count: 2 });
  await expect(page.getByText('Lanternfly 1 of 2 — highlighted below', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Answer uncertain', exact: true }).click();
  await expect(page.getByText('Thanks!', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review another lanternfly', exact: true }).click();
  await expect(page.getByText('Lanternfly 2 of 2 — highlighted below', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Answer alive', exact: true }).click();
  await expect(page.getByText('Thanks!', { exact: true })).toBeVisible();
  expect(state.saves.map(args => args.p_insect_id)).toEqual(state.rows.map(row => row.insect_id));
  await page.reload(); await page.getByRole('tab', { name: 'Sightings', exact: true }).click();
  await expect(page.getByText('The post stays', { exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole('button', { name: 'Answer alive', exact: true }).count()).toBe(0);
  expect(state.saves).toHaveLength(2);
});
test('a rejected save never thanks the user or removes the post; full seats never submit a vote', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page); state.deny = true;
  await page.getByRole('button', { name: 'Answer dead', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByText('Thanks!', { exact: true })).toHaveCount(0);
  await expect(page.getByText('The post stays', { exact: true })).toBeVisible();
  state.deny = false; state.full = true;
  await page.getByRole('button', { name: 'Answer alive', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('seats are full');
  expect(state.saves).toHaveLength(0);
  state.full = false; state.rows[0].revision = 2;
  await page.getByRole('button', { name: 'Answer dead', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('review changed');
  expect(state.saves).toHaveLength(0);
});
test('authors never receive their own inline review prompt', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page, { own: true });
  await expect(page.getByText('The post stays', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Is this lanternfly alive or dead?' })).toHaveCount(0);
  expect(state.claims).toBe(0);
});


test('white approved cards have mixed result tags and lazy, expandable anonymous vote results', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page, { approved: true, count: 2, own: true });
  await page.getByRole('tab', { name: 'My submissions', exact: true }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Alive · 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Dead · 1', { exact: true })).toBeVisible();
  await expect(page.getByText('The post stays', { exact: true }).locator('..')).toHaveCSS('background-color','rgb(255, 255, 255)');
  expect(state.summaryCalls).toBe(0);
  const toggle = page.getByRole('button', { name: 'Community votes', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await toggle.click();
  await expect(page.getByText('Alive: 1 (17%)', { exact: true })).toBeVisible();
  await expect(page.getByText('Dead: 3 (50%)', { exact: true })).toBeVisible();
  await expect(page.getByText('Uncertain: 2 (33%)', { exact: true })).toBeVisible();
  await expect(page.getByText('6 responses', { exact: true })).toBeVisible();
  await expect(page.getByText('No community votes recorded.', { exact: true })).toBeVisible();
  expect(state.claims).toBe(0);
  await toggle.click();
  await expect(page.getByText('6 responses', { exact: true })).toHaveCount(0);
  state.rows[0] = {...state.rows[0], revision:2, final_label:null, my_vote:null};
  await page.getByRole('button', {name:'Refresh feed',exact:true}).click();
  await expect(page.getByText('Awaiting approval',{exact:true})).toBeVisible();
  await expect(page.getByText('Dead · 1',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Alive · 1',{exact:true})).toHaveCount(0);
  await toggle.click();
  await expect(page.getByText('Community votes will be available after approval.',{exact:true})).toHaveCount(2);
  await expect(page.getByText('6 responses',{exact:true})).toHaveCount(0);
});

test('pending totals are hidden per insect until voting, then refresh without another expansion', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page, {count:2});
  await expect(page.getByText('The post stays', {exact:true}).locator('..')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Community votes', exact: true }).click();
  await expect(page.getByText('Submit your response to see community votes.', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Alive · 1', {exact:true})).toHaveCount(0);
  expect(state.claims).toBe(0);
  await page.getByRole('button', { name:'Answer uncertain',exact:true }).click();
  await expect(page.getByText('Uncertain: 1 (100%)', {exact:true})).toBeVisible();
  await expect(page.getByText('Submit your response to see community votes.', {exact:true})).toHaveCount(1);
  await expect(page.getByText('1 response', {exact:true})).toBeVisible();
  expect(state.saves).toHaveLength(1);
});

test('vote results failure is retryable without claiming review seats or hiding the post', async ({ page }) => {
  test.skip(!api, 'Requires public Supabase URL at build time; hosted requests are intercepted.');
  const state = await setup(page, {approved:true});
  state.summaryError=true;
  await page.getByRole('button', {name:'Community votes',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Community votes could not load. Please retry.');
  await expect(page.getByText('The post stays',{exact:true})).toBeVisible();
  state.summaryError=false;
  await page.getByRole('button',{name:'Retry community votes',exact:true}).click();
  await expect(page.getByText('6 responses',{exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(state.claims).toBe(0);
});
