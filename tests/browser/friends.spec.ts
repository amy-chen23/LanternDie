import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
const alice = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const bob = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
type Relationship = { id: string; requester_id: string; recipient_id: string; status: string };

test('two members send, cancel, decline, accept, view friends and remove a friendship', async ({ browser }) => {
  test.skip(!api, 'Requires public Supabase URL; all Auth/REST is mocked.');
  let relationships: Relationship[] = [];
  let nextId = 1;
  const nameOf = (id: string) => id === alice ? 'Alice' : 'Bob';
  async function setup(page: Page, viewer: string) {
    const user = { id: viewer, aud: 'authenticated', role: 'authenticated', email: `${nameOf(viewer)}@example.invalid`, user_metadata: { display_name: nameOf(viewer) }, app_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
    const projectRef = new URL(api).hostname.split('.')[0];
    const payload = Buffer.from(JSON.stringify({ sub: viewer, exp: 4102444800, role: 'authenticated' })).toString('base64url');
    await page.addInitScript(({ projectRef, user, payload }) => {
      localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.fixture`, refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, expires_in: 3600, user }));
    }, { projectRef, user, payload });
    await page.route(`${api}/**`, async route => {
      const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
      const json = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
      if (url.pathname.endsWith('/auth/v1/user')) return json(user);
      if (name === 'get_profile_field_points') return json(3);
      if (name === 'friend_requests') {
        if (request.method() === 'POST') {
          const body = request.postDataJSON();
          expect(body.requester_id).toBe(viewer);
          expect(body.requester_id).not.toBe(body.recipient_id);
          relationships.push({ ...body, id: `00000000-0000-0000-0000-${String(nextId++).padStart(12, '0')}`, status: 'pending' });
          return json(null);
        }
        if (request.method() === 'DELETE') {
          const id = url.searchParams.get('id')?.slice(3);
          relationships = relationships.filter(row => row.id !== id);
          return json(null);
        }
        const rows = relationships.filter(row => [row.requester_id, row.recipient_id].includes(viewer));
        return json(url.searchParams.has('order') ? rows : rows[0] ?? null);
      }
      if (name === 'accept_friend_request') {
        const row = relationships.find(row => row.id === request.postDataJSON().request_id);
        expect(row?.recipient_id).toBe(viewer);
        row!.status = 'accepted';
        return json(null);
      }
      if (name === 'community_profiles') {
        const id = url.searchParams.get('user_id');
        return json(id?.startsWith('eq.') ? { display_name: nameOf(id.slice(3)) }
          : [alice, bob].map(user_id => ({ user_id, display_name: nameOf(user_id) })));
      }
      if (name === 'reports') {
        if (url.searchParams.get('user_id') === `eq.${viewer}`) return json([]);
        if (url.searchParams.get('user_id') === `eq.${alice}`) return json([]);
        return json([{ id: '11111111-1111-1111-1111-111111111111', user_id: bob, photo_path: `${bob}/photo.jpg`, created_at: '2026-11-01T00:00:00Z', observed_on: '2026-11-01', visibility: 'public', workflow_status: 'published', insects_ready: false, upvotes: 3, downvotes: 0 }]);
      }
      return json([]);
    });
    await page.goto('/');
  }
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  try {
    const a = await aliceContext.newPage(), b = await bobContext.newPage();
    await setup(a, alice);
    await a.getByRole('button', { name: "View Bob's profile", exact: true }).click();
    await a.getByRole('button', { name: 'Add friend', exact: true }).click();
    await expect(a.getByText('Request sent', { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(a.getByRole('button', { name: 'Add friend', exact: true })).toBeVisible();
    expect(relationships).toHaveLength(0);
    await a.getByRole('button', { name: 'Add friend', exact: true }).click();
    await expect(a.getByText('Request sent', { exact: true })).toBeVisible();
    await setup(b, bob);
    await b.getByRole('tab', { name: 'My Profile', exact: true }).click();
    await b.getByRole('button', { name: 'Friends & requests', exact: true }).click();
    await b.getByRole('button', { name: 'Decline request', exact: true }).click();
    await expect(b.getByText('No incoming requests.', { exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Back to sightings', exact: true }).click();
    await a.getByRole('button', { name: "View Bob's profile", exact: true }).click();
    await a.getByRole('button', { name: 'Add friend', exact: true }).click();
    await expect(a.getByText('Request sent', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Refresh friends & requests', exact: true }).click();
    await b.getByRole('button', { name: 'Accept request', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Remove friend', exact: true })).toBeVisible();
    expect(relationships[0].status).toBe('accepted');
    await b.getByRole('button', { name: "View Alice's profile", exact: true }).click();
    await expect(b.getByText('No public sightings to show.', { exact: true })).toBeVisible();
    await expect(b.getByText('Alice', { exact: true }).last()).toBeVisible();
    await expect(b.getByRole('button', { name: 'Remove friend', exact: true }).last()).toBeVisible();
    await b.getByRole('button', { name: 'Back to my profile', exact: true }).click();
    await a.getByRole('button', { name: 'Back to sightings', exact: true }).click();
    await a.getByRole('tab', { name: 'My Profile', exact: true }).click();
    await a.getByRole('button', { name: 'Friends & requests', exact: true }).click();
    await expect(a.getByRole('button', { name: "View Bob's profile", exact: true })).toBeVisible();
    await a.getByRole('button', { name: 'Remove friend', exact: true }).click();
    await expect(a.getByText('No friends yet. Visit a member profile to send a request.', { exact: true })).toBeVisible();
    expect(relationships).toHaveLength(0);
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
