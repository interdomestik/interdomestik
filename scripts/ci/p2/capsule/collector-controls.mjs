import { writeSync } from 'node:fs';
const mode = process.argv[2];
const block = Buffer.alloc(4096, 65);
if (mode === 'stdout-overflow') for (;;) writeSync(1, block);
else if (mode === 'stderr-overflow') for (;;) writeSync(2, block);
else if (mode === 'combined-overflow')
  for (;;) {
    writeSync(1, block);
    writeSync(2, block);
  }
else if (mode === 'timeout') setInterval(() => {}, 1000);
else if (mode === 'malformed') writeSync(1, 'not-json');
else if (mode === 'truncated')
  writeSync(1, '{"kind":"untrusted-wrapper-observations-v1","cases":[');
else if (mode === 'forged-empty') writeSync(1, '{}');
else if (mode === 'forged-admission')
  writeSync(1, JSON.stringify({ checksPassed: true, nativeAdmission: true, wholeGuardPass: true }));
else if (mode === 'wrong-source-config')
  writeSync(
    1,
    JSON.stringify({
      kind: 'untrusted-wrapper-observations-v1',
      cases: [],
      suites: [],
      source: 'foreign',
      config: 'foreign',
    })
  );
else throw Error('Unknown fixed control');
