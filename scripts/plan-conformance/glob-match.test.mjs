import assert from 'node:assert/strict';
import test from 'node:test';

import { matchesGlobPattern } from './glob-match.mjs';

test('glob matching supports recursive path segments', () => {
  assert.equal(matchesGlobPattern('scripts/plan-conformance/gate.mjs', 'scripts/**'), true);
  assert.equal(matchesGlobPattern('docs/plans/a/b.md', 'docs/plans/**'), true);
});

test('glob matching treats regex metacharacters as literals', () => {
  assert.equal(matchesGlobPattern('docs/plans/F1.0/notes.md', 'docs/plans/F1.0/**'), true);
  assert.equal(matchesGlobPattern('docs/plans/F1x0/notes.md', 'docs/plans/F1.0/**'), false);
});
