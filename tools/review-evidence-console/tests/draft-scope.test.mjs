import assert from 'node:assert/strict';
import test from 'node:test';

import { accountWithDraftScope } from '../server/auth/draft-scope.mjs';

const account = Object.freeze({ id: 'acct_gazmend' });

test('draft scope requires one canonical 32-64 byte base64url session secret', async () => {
  for (const secret of ['', 'not base64url', Buffer.alloc(31).toString('base64url')]) {
    await assert.rejects(accountWithDraftScope(account, secret));
  }
  const valid = Buffer.alloc(32, 7).toString('base64url');
  const first = await accountWithDraftScope(account, valid);
  const second = await accountWithDraftScope(account, valid);
  assert.match(first.draftScope, /^draft_[A-Za-z0-9_-]{43}$/u);
  assert.equal(first.draftScope, second.draftScope);
});
