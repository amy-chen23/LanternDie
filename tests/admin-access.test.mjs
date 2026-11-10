import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAdminAccess, createAdminAccessGuard } from '../lib/admin-access.ts';

const response = data => async () => ({ data, error: null });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
test('only an explicit successful boolean true authorizes admin access', async () => {
  assert.deepEqual(await checkAdminAccess(response(true)), { allowed: true, error: '' });
  assert.deepEqual(await checkAdminAccess(response(false)), { allowed: false, error: '' });
  for (const value of ['true', 1, null, undefined, { role: 'admin' }]) {
    const result = await checkAdminAccess(response(value));
    assert.equal(result.allowed, false);
    assert.ok(result.error);
  }
});
test('network/database errors deny access even if data contains true', async () => {
  assert.equal((await checkAdminAccess(async () => ({ data: true, error: new Error('failed') }))).allowed, false);
  assert.equal((await checkAdminAccess(async () => { throw new Error('offline'); })).allowed, false);
});
test('late admin response cannot grant access after switching accounts/signing out', async () => {
  const guard = createAdminAccessGuard();
  const oldAccount = deferred();
  const oldRequest = guard.check(() => oldAccount.promise);
  guard.invalidate();
  const currentRequest = await guard.check(response(false));
  oldAccount.resolve({ data: true, error: null });
  assert.equal(currentRequest.allowed, false);
  assert.equal(await oldRequest, null);
});
test('a delayed grant cannot overwrite a newer revocation/error result', async () => {
  const guard = createAdminAccessGuard();
  const delayed = deferred();
  const oldRequest = guard.check(() => delayed.promise);
  const revoked = await guard.check(response(false));
  delayed.resolve({ data: true, error: null });
  assert.equal(revoked.allowed, false);
  assert.equal(await oldRequest, null);
});
test('unmount invalidates an in-flight permission check', async () => {
  const guard = createAdminAccessGuard();
  const pending = deferred();
  const request = guard.check(() => pending.promise);
  guard.invalidate();
  pending.resolve({ data: true, error: null });
  assert.equal(await request, null);
});
