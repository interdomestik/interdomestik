import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNativeScannerArgs } from './sonar-scan-lib.mjs';

test('buildNativeScannerArgs places dlx before package selection', () => {
  assert.deepEqual(buildNativeScannerArgs(['-Dsonar.host.url=http://localhost:9000']), [
    'dlx',
    '--package=@sonar/scan',
    'sonar-scanner',
    '-Dsonar.host.url=http://localhost:9000',
  ]);
});
