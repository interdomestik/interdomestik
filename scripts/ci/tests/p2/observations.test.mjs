import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateP2Observation } from '../../p2/observations.mjs';
const q = new URL('../../p2/', import.meta.url);
const oracle = JSON.parse(fs.readFileSync(new URL('dist/source-manifest.json', q)));
const js = fs.readFileSync(new URL('capsule/dist/wrapper.mjs', q));
const raw = fs.readFileSync(new URL('./dist/local-coverage-observation.json', import.meta.url));
const value = JSON.parse(raw);
test('current ten wrapper cases and actual host V8 shape accepted', () =>
  assert.equal(validateP2Observation(raw, oracle, js).cases.length, 10));
const mutations = {
  forgedAdmission: v => (v.runtimeAdmission = true),
  missingCase: v => v.cases.pop(),
  duplicateCase: v => (v.cases[0] = v.cases[1]),
  failedCase: v => (v.cases[0].state = 'fail'),
  wrongSource: v => (v.coverage.sourceSha256 = '0'.repeat(64)),
  wrongURL: v => (v.coverage.url = 'file:///foreign.mjs'),
  wrongKind: v => (v.kind = 'untrusted-wrapper-observations-v1'),
  outsideRange: v => (v.coverage.functions[0].ranges[0].endOffset = js.length + 100),
  negativeCount: v => (v.coverage.functions[0].ranges[0].count = -1),
  missingCoverage: v => delete v.coverage,
  arbitraryCoverageField: v => (v.coverage.admission = true),
};
for (const [name, change] of Object.entries(mutations))
  test('reject ' + name, () => {
    const v = structuredClone(value);
    change(v);
    assert.throws(() => validateP2Observation(Buffer.from(JSON.stringify(v)), oracle, js));
  });
test('reject malformed/truncated', () =>
  assert.throws(() => validateP2Observation(raw.subarray(0, -3), oracle, js)));
test('reject byte overflow before parsing', () =>
  assert.throws(() => validateP2Observation(Buffer.alloc(65537), oracle, js), /byte cap/));
