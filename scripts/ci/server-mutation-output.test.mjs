// Contract tests of the scanners' GitHub notices (WP-05 code review r6, blocker 8). A workflow
// command separates its properties with commas: a located notice is
// `::notice file=<f>,line=<n>,title=<t>::<text>`, so the title is a property of its own.
import assert from 'node:assert/strict';
import test from 'node:test';

import { annotate } from './server-mutation/output.mjs';

function notices(findings) {
  const lines = [];
  const result = {
    id: 'CHK-22',
    new: findings.map(f => f.id),
    findings,
    tamper: [],
    units: {},
    total: findings.length,
    fixed: [],
  };
  annotate({ errors: [], status: 'ok', exit: 0 }, [result], { write: text => lines.push(text) });
  return lines
    .join('')
    .split('\n')
    .filter(line => line.startsWith('::'));
}

test('a located notice carries file, line and title as separate properties', () => {
  assert.deepEqual(
    notices([
      { id: 'a', file: 'apps/web/src/a.tsx', line: 7, message: 'm' },
      { id: 'b', file: 'apps/web/src/b.tsx', message: 'm' },
      { id: 'c', message: 'm' },
    ]),
    [
      '::notice file=apps/web/src/a.tsx,line=7,title=CHK-22 new::a: m',
      '::notice file=apps/web/src/b.tsx,title=CHK-22 new::b: m',
      '::notice title=CHK-22 new::c: m',
    ]
  );
});
