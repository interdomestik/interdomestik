import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertP2Coverage, mergeP2Coverage } from '../../p2/coverage-adapter.mjs';
import { runCoverageGate } from '../../coverage-gate.mjs';
const q = new URL('../../p2/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, q), 'utf8');
test('real merged coverage can pass where invented zero target pre-gate falsely fails', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-borderline-')));
  try {
    const p2 = await convertP2Coverage({
      observation: JSON.parse(
        fs.readFileSync(new URL('./dist/local-coverage-observation.json', import.meta.url))
      ),
      generatedJs: read('capsule/dist/wrapper.mjs'),
      generatedTs: read('capsule/dist/wrapper.source.ts'),
      sourceMap: JSON.parse(read('capsule/dist/wrapper.js.map')),
      originalSource: read('capsule/dist/wrapper.original.ts'),
      retainedSegments: JSON.parse(read('dist/source-manifest.json')).retainedSegments,
      originalPath: root + '/apps/web/src/server/operations/m4-qualification-admin-assignment.ts',
    });
    const output = root + '/apps/web/coverage';
    mergeP2Coverage({ ambientCoverage: {}, p2Coverage: p2, outputDirectory: output });
    const summaryPath = output + '/coverage-summary.json',
      summary = JSON.parse(fs.readFileSync(summaryPath));
    const target = summary.total.lines;
    assert.ok(target.covered > 0);
    const otherTotal = 100,
      otherCovered = Math.ceil(0.6 * (otherTotal + target.total) - target.covered);
    const required = root + '/packages/shared-auth/coverage';
    fs.mkdirSync(required, { recursive: true });
    fs.writeFileSync(
      required + '/coverage-summary.json',
      JSON.stringify({ total: { lines: { total: otherTotal, covered: otherCovered } } })
    );
    const actual = runCoverageGate({ rootDir: root, minLinesPct: 60, stdout: false });
    assert.equal(actual.ok, true);
    summary.total.lines.covered = 0;
    fs.writeFileSync(summaryPath, JSON.stringify(summary));
    const zero = runCoverageGate({ rootDir: root, minLinesPct: 60, stdout: false });
    assert.equal(zero.ok, false);
    assert.equal(actual.aggregate.total, zero.aggregate.total);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
