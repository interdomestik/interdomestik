import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function keys(value, expected) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...expected].sort().join()
  )
    throw Error('P2 observation shape');
}
export function validateP2Observation(raw, oracle, generatedJs) {
  if (!(raw instanceof Uint8Array) || raw.byteLength > 65536)
    throw Error('P2 observation byte cap');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  keys(value, ['kind', 'cases', 'suites', 'coverage']);
  if (value.kind !== 'untrusted-wrapper-observations-v2') throw Error('P2 observation kind');
  const expected = oracle.tests.map(test => ({ name: test.name, state: 'pass' }));
  if (expected.length !== 10 || JSON.stringify(value.cases) !== JSON.stringify(expected))
    throw Error('P2 exact ten cases');
  if (
    JSON.stringify(value.suites) !==
    JSON.stringify([
      { name: 'wrapper.test.mjs', state: 'pass' },
      { name: 'admin assignment relay adapter', state: 'pass' },
    ])
  )
    throw Error('P2 suite states');
  keys(value.coverage, ['version', 'url', 'sourceSha256', 'functions']);
  const coverage = value.coverage;
  if (
    coverage.version !== 1 ||
    coverage.url !== 'file:///capsule/wrapper.mjs' ||
    coverage.sourceSha256 !== hash(generatedJs)
  )
    throw Error('P2 coverage source binding');
  if (
    !Array.isArray(coverage.functions) ||
    coverage.functions.length < 1 ||
    coverage.functions.length > 128
  )
    throw Error('P2 coverage functions');
  const length = new TextDecoder('utf-8', { fatal: true }).decode(generatedJs).length;
  for (const fn of coverage.functions) {
    keys(fn, ['functionName', 'ranges', 'isBlockCoverage']);
    if (
      typeof fn.functionName !== 'string' ||
      fn.functionName.length > 256 ||
      typeof fn.isBlockCoverage !== 'boolean' ||
      !Array.isArray(fn.ranges) ||
      !fn.ranges.length ||
      fn.ranges.length > 256
    )
      throw Error('P2 coverage function');
    for (const range of fn.ranges) {
      keys(range, ['startOffset', 'endOffset', 'count']);
      if (
        ![range.startOffset, range.endOffset, range.count].every(Number.isSafeInteger) ||
        range.startOffset < 0 ||
        range.endOffset <= range.startOffset ||
        range.endOffset > length ||
        range.count < 0 ||
        range.count > 1000000
      )
        throw Error('P2 coverage range');
    }
  }
  return value;
}
