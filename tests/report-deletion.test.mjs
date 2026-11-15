import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteOwnedReport } from '../lib/report-deletion.ts';

function fixture({ rowError = null, data = { photo_path: 'owner/photo.jpg' }, photoError = null, storageThrows = false } = {}) {
  const calls = [];
  const query = {
    delete() { calls.push(['delete']); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    select(columns) { calls.push(['select', columns]); return this; },
    async single() { calls.push(['row']); return { data, error: rowError }; },
  };
  const client = {
    from(table) { calls.push(['table', table]); return query; },
    storage: {
      from(bucket) {
        calls.push(['bucket', bucket]);
        return { async remove(paths) {
          calls.push(['remove', paths]);
          if (storageThrows) throw new Error('Offline');
          return { error: photoError };
        } };
      },
    },
  };
  return { client, calls };
}

test('deletion targets both the report and owner, then cleans up the returned photo', async () => {
  const { client, calls } = fixture();
  assert.equal(await deleteOwnedReport(client, 'report', 'owner'), true);
  assert.deepEqual(calls, [
    ['table', 'reports'], ['delete'], ['eq', 'id', 'report'], ['eq', 'user_id', 'owner'],
    ['select', 'photo_path'], ['row'], ['bucket', 'report-photos'], ['remove', ['owner/photo.jpg']],
  ]);
});

test('denied or missing reports never delete a photo or report success', async () => {
  for (const options of [{ rowError: { message: 'Denied' } }, { data: null }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(deleteOwnedReport(client, 'foreign-report', 'owner'));
    assert.equal(calls.some(call => call[0] === 'remove'), false);
  }
});

test('storage failures report incomplete cleanup without failing the completed deletion', async () => {
  for (const options of [{ photoError: { message: 'Denied' } }, { storageThrows: true }]) {
    const { client } = fixture(options);
    assert.equal(await deleteOwnedReport(client, 'report', 'owner'), false);
  }
});
