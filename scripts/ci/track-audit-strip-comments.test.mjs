import assert from 'node:assert/strict';
import test from 'node:test';

import { stripComments } from '../track-audit.mjs';
import { audit } from './track-audit-fixtures.mjs';

// `pnpm track:audit` runs in the required check `audit`. Defect class: a contract audit that
// passes without checking (no checks, a target that matches nothing, an exclusion that hides a
// file without a reason or after the file stopped violating).
// This file: `strip_comments` and the comment stripper.

test('track audit: stripComments removes every comment form and keeps code, strings and regexes', () => {
  const cases = [
    ['a // c\nb', 'a     \nb'],
    ['a // c\rb', 'a     \rb'],
    ['a // c b', 'a      b'],
    ['a /* c\nd */ b', 'a     \n     b'],
    ["s = 'http://x' // c", "s = 'http://x'     "],
    ['s = "/* no */"', 's = "/* no */"'],
    ['t = `a ${b /* c */} // no`', 't = `a ${b        } // no`'],
    ['t = `x ${`y ${z}`} /* no */`', 't = `x ${`y ${z}`} /* no */`'],
    ['r = /\\/\\/ no/u.test(x) // c', 'r = /\\/\\/ no/u.test(x)     '],
    ['r = /[/*]/u; // c', 'r = /[/*]/u;     '],
    ['x = a / b / c // c', 'x = a / b / c     '],
    ['return /* c */ /a\\/b/', 'return         /a\\/b/'],
  ];
  for (const [source, expected] of cases) {
    assert.equal(stripComments(source), expected, JSON.stringify(source));
    assert.equal(stripComments(source).length, source.length);
  }
});

test('track audit: strip_comments decides on code only, and must be a boolean', () => {
  const check = extra => ({
    id: 'c',
    type: 'regex',
    targets: ['src/*.ts'],
    must_not_match: ['bad\\('],
    ...extra,
  });
  const files = { 'src/a.ts': 'ok(); // bad()\n/* bad() */\n' };
  assert.equal(audit(files, [check()]).length, 1);
  assert.deepEqual(audit(files, [check({ strip_comments: true })]), []);
  const live = audit({ 'src/a.ts': '/* x */ bad();\n' }, [check({ strip_comments: true })]);
  assert.equal(live.length, 1, live.join('\n'));
  assert.match(
    audit(files, [check({ strip_comments: 'yes' })])[0],
    /strip_comments that is not a boolean/u
  );
  const onFile = { id: 'e', type: 'file_exists', targets: ['src/a.ts'], strip_comments: true };
  assert.match(
    audit(files, [onFile])[0],
    /regex-only keys on a file_exists check: strip_comments/u
  );
});
