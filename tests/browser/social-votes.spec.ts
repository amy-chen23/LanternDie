import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', viewer = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const id = '11111111-1111-1111-1111-111111111111';
const photo = readFileSync('tests/fixtures/browser-inference/above.jpg');

async function setup(page: Page, own = false) {
  const state = { vote: 0, fail: false, saves: 0, forbidden: [] as string[] };
  const user = { id: own ? owner : viewer, aud: 'authenticated', role: 'authenticated', email: 'social@example.invalid', user_metadata: { display_name: 'Social QA' }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const ref = new URL(api).hostname.split('.')[0], payload = Buffer.from(JSON.stringify({ sub: user.id, exp: 4102444800, role: 'authenticated' })).toString('base64url');
  await page.addInitScript(({ref,user,payload}) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:3600,token_type:'bearer',user})), {ref,user,payload});
  await page.route(`${api}/**`, async route => {
    const req = route.request(), url = new URL(req.url()), name = url.pathname.split('/').at(-1);
    const json = (value: unknown) => route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/storage/')) {
      if (req.method() === 'GET') return route.fulfill({contentType:'image/jpeg',body:photo});
      if (url.pathname.includes('/object/sign/report-photos')) return json(req.postDataJSON().paths.map((path: string) => ({path,signedURL:`/object/sign/report-photos/${path}?token=fixture`,error:null})));
      return json([]);
    }
    if (/review|assessment/.test(name ?? '') || url.pathname.includes('/rpc/')) {
      state.forbidden.push(name!); return route.fulfill({status:403,body:'Review APIs retired'});
    }
    if (name === 'report_votes') {
      if (req.method() !== 'GET') {
        if (state.fail) return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Vote denied'})});
        state.vote = req.method() === 'DELETE' ? 0 : req.postDataJSON().value;
        state.saves++; return json(null);
      }
      if (url.searchParams.get('select') === 'value') return json(state.vote ? {value:state.vote} : null);
      return json(state.vote ? [{report_id:id,value:state.vote}] : []);
    }
    if (name === 'reports') {
      const counts = {upvotes:Number(state.vote === 1),downvotes:Number(state.vote === -1)};
      if (url.searchParams.get('select') === 'upvotes,downvotes') return json(counts);
      return json(url.searchParams.has('user_id') && !own ? [] : [{id,user_id:owner,created_at:'2026-11-01T00:00:00Z',photo_path:`${owner}/fixture.jpg`,observed_on:'2026-11-01',caption:'Social-only sighting',visibility:'public',workflow_status:'published',insects_ready:true,...counts}]);
    }
    if (name === 'community_profiles') return json([{user_id:owner,display_name:'Social QA'}]);
    if (name === 'report_identifications') return json([{report_id:id,status:'detected',image_width:135,image_height:203,detections:[{x:0,y:0,width:135,height:203}],updated_at:'2026-11-01T00:00:00Z'}]);
    if (name === 'report_insects') return json([{id:'22222222-2222-2222-2222-222222222222',report_id:id,revision:1,box:{x:0,y:0,width:135,height:203},label:'pending'}]);
    // Historical credits are independent of these social reactions.
    if (name === 'report_kill_credits') return json([{report_id:id,dead_insects:2}]);
    if (name === 'report_processing_jobs') return json([{report_id:id,status:'complete'}]);
    return json([]);
  });
  await page.goto('/'); await page.getByRole('tab',{name:'Sightings',exact:true}).click();
  return state;
}

for (const own of [true,false]) test(`social votes switch, toggle off and persist on ${own ? 'own' : 'another member’s'} sighting without review UI`, async ({page}) => {
  test.skip(!api, 'Requires public configuration; all hosted requests intercepted.');
  const state = await setup(page,own);
  const up = page.getByRole('button',{name:'Upvote report',exact:true}), down = page.getByRole('button',{name:'Downvote report',exact:true});
  await up.click(); await expect(page.getByLabel('Score 1',{exact:true})).toBeVisible();
  await expect.poll(() => state.saves).toBe(1);
  await page.reload(); await page.getByRole('tab',{name:'Sightings',exact:true}).click();
  await expect(page.getByLabel('Score 1',{exact:true})).toBeVisible();
  await down.click(); await expect(page.getByLabel('Score -1',{exact:true})).toBeVisible();
  await expect.poll(() => state.saves).toBe(2);
  await down.click(); await expect(page.getByLabel('Score 0',{exact:true})).toBeVisible();
  await expect.poll(() => state.saves).toBe(3);
  await expect(page.getByText(/^(Approved|Awaiting approval|Community votes|Alive · 1|Dead · 1)$/)).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Needs review',exact:true})).toHaveCount(0);
  if (own) {
    await page.getByRole('tab',{name:'My Profile',exact:true}).click();
    await expect(page.getByText('FIELD POINTS',{exact:true}).locator('..').getByText('2',{exact:true})).toBeVisible();
  }
  expect(state.forbidden).toEqual([]);
});

test('denied social votes visibly roll back instead of pretending to persist', async ({page}) => {
  test.skip(!api, 'Requires public configuration; all hosted requests intercepted.');
  const state = await setup(page); state.fail = true;
  await page.getByRole('button',{name:'Upvote report',exact:true}).click();
  await expect(page.getByText('Could not save vote.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Score 0',{exact:true})).toBeVisible();
  expect(state.saves).toBe(0); expect(state.vote).toBe(0);
});
