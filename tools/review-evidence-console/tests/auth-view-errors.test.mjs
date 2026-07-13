import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAuthView } from '../public/src/app/auth-view.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { copy, fakeDocument } from './fake-dom.mjs';

setDocument(fakeDocument);

test('login distinguishes service and origin failures from wrong credentials', () => {
  const cases = [
    ['unavailable', /nuk është i disponueshëm/u],
    ['forbidden', /Kërkesa u refuzua/u],
    ['authentication_failed', /fjalëkalimi nuk është i saktë/u],
  ];
  for (const [reason, expected] of cases) {
    const view = renderAuthView({ status: 'anonymous', reason }, () => {});
    assert.match(copy(view), expected);
  }
});
