import test from 'node:test';
import {
  stageJournal,
  withGrantsRole,
  withGrantsScratch,
} from './wp16-1-runtime-grants.test-support';

test('WP-16.1 checks the PG16 runtime grant checkpoint preflight', async t => {
  await withGrantsRole(t, async () => {
    await t.test(
      'withholding one column fails preflight and the original 0105 predicate',
      async () => {
        await withGrantsScratch(client => stageJournal(client, 'missing'));
      }
    );
  });
});
