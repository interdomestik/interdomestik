import assert from 'node:assert/strict';
import test from 'node:test';

import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

test('S7 HelpNow owns only its four localized copy catalogs', () => {
  for (const locale of ['en', 'sq', 'mk', 'sr']) {
    assert.equal(
      structuredArtifactOwner(`apps/web/src/features/help-now/copy-${locale}.json`),
      's7-helpnow-localized-copy-contract'
    );
  }

  for (const path of [
    'apps/web/src/features/help-now/copy-de.json',
    'apps/web/src/features/other/copy-en.json',
    'apps/web/src/features/help-now/copy-en-extra.json',
    'apps/web/src/features/help-now/nested/copy-en.json',
    'apps/web/src/features/help-now/copy-en.yaml',
  ]) {
    assert.equal(structuredArtifactOwner(path), null);
  }
});
