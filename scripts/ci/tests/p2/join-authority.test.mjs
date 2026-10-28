import test from 'node:test';
import assert from 'node:assert/strict';
import { takeFreshP2CoverageForJoin } from '../../p2/ordinary-dispatch.mjs';
for (const [name, value] of Object.entries({
  plain: { freshP2: true, coverageMerged: true },
  serialized: JSON.parse('{"freshP2":true,"nativeAdmission":true}'),
  cache: { reuse: true, coverageMerged: true },
}))
  test('M4 join refuses ' + name + ' result', () =>
    assert.throws(
      () => takeFreshP2CoverageForJoin(value, { eventName: 'pull_request' }),
      /Fresh same-event P2 result/
    )
  );
