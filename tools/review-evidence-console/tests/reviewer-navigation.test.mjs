import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { renderPrimaryNavigation } from '../public/src/components/primary-navigation.mjs';
import { formatRoute, parseRoute } from '../public/src/router.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';

setDocument(fakeDocument);

test('reviewer navigation makes current work and past reviews equally discoverable', () => {
  const navigation = renderPrimaryNavigation('history');
  assert.match(copy(navigation), /Detyrat/);
  assert.match(copy(navigation), /Historia/);
  const links = walk(navigation).filter(node => node.tagName === 'A');
  assert.deepEqual(
    links.map(link => [link.attributes.href, link.attributes['aria-current']]),
    [
      ['#/', undefined],
      ['#/history', 'page'],
    ]
  );
});

test('history has a stable deep link and unknown routes still fail closed', () => {
  assert.deepEqual(parseRoute('#/history'), { name: 'history' });
  assert.equal(formatRoute({ name: 'history' }), '#/history');
  assert.deepEqual(parseRoute('#/history/private'), { name: 'inbox' });
  assert.deepEqual(parseRoute('#/receipt/rec_abc/correct'), {
    name: 'receipt',
    receiptId: 'rec_abc',
    correcting: true,
  });
  assert.equal(
    formatRoute({ name: 'receipt', receiptId: 'rec_abc', correcting: true }),
    '#/receipt/rec_abc/correct'
  );
});
