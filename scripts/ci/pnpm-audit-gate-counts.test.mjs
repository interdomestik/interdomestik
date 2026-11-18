import { test } from 'node:test';

import {
  COMPLETENESS,
  PATH_A,
  PATH_B,
  SCOPED_ALLOWLIST,
  advisory,
  assertBlocked,
  assertPass,
  encodings,
  makeGate,
  pnpmReport,
  realGate,
  runGate,
} from './pnpm-audit-fixtures.mjs';

// Blocking-count completeness: one count per advisory identity and installed version.

const scopedGate = makeGate(SCOPED_ALLOWLIST);

test('blocking counts are complete per finding version, never per record', async t => {
  const twoVersions = (extra = {}) =>
    advisory(1000011, 'high', [PATH_A], {
      findings: [
        { version: '1.0.0', paths: [PATH_A] },
        { version: '2.0.0', paths: [PATH_B] },
      ],
      ...extra,
    });
  for (const [encoding, input] of Object.entries(encodings([twoVersions()], { high: 2 }))) {
    await t.test(`one count per installed version passes (${encoding})`, () =>
      assertPass(runGate(scopedGate, input))
    );
  }
  for (const [encoding, input] of Object.entries(
    encodings([twoVersions(), twoVersions()], { high: 2 })
  )) {
    await t.test(`repeated records do not add versions (${encoding})`, () =>
      assertPass(runGate(scopedGate, input))
    );
  }
  for (const high of [1, 3]) {
    await t.test(`a summary of ${high} for two versions blocks`, () =>
      assertBlocked(runGate(scopedGate, pnpmReport([twoVersions()], { high })), COMPLETENESS)
    );
  }
  const badVersions = {
    missing: undefined,
    empty: '',
    numeric: 2,
    object: {},
    'space-padded': '1.0.0 ',
    'inner space': '1.0 .0',
    'leading zero': '1.0.04',
    'zero-width space': '1.0.0\u200b',
    'build metadata': '1.0.0+build',
    'two parts': '1.0',
  };
  for (const [name, version] of Object.entries(badVersions)) {
    await t.test(`a ${name} finding version fails closed`, () =>
      assertBlocked(
        runGate(
          scopedGate,
          pnpmReport([twoVersions({ findings: [{ version, paths: [PATH_A] }] })], { high: 1 })
        ),
        /finding 1 has invalid version/
      )
    );
  }
});

test('one identity cannot gain a count from a versionless or malformed record', async t => {
  const versioned = advisory(1000001, 'high', [PATH_A]);
  const versionless = advisory(1000001, 'high', [], { findings: [] });
  for (const [encoding, input] of Object.entries(
    encodings([versioned, versionless], { high: 2 })
  )) {
    await t.test(`unconditional entry, versioned + empty record (${encoding})`, () =>
      assertBlocked(runGate(scopedGate, input), /mixes records with and without finding versions/)
    );
  }
  await t.test('whitespace cannot split one version on an allowed path', () => {
    const padded = advisory(1000010, 'high', [PATH_A], {
      findings: [
        { version: '1.0.0', paths: [PATH_A] },
        { version: '1.0.0 ', paths: [PATH_A] },
      ],
    });
    assertBlocked(runGate(scopedGate, pnpmReport([padded], { high: 2 })), /invalid version/);
  });
  await t.test('one npm id cannot appear with and without a ghsaId', () => {
    const plain = advisory(1000001, 'high', [PATH_A]);
    const tagged = advisory(1000001, 'high', [PATH_A], { ghsaId: 'GHSA-test-1000003' });
    for (const records of [
      [plain, tagged],
      [tagged, plain],
    ]) {
      for (const input of Object.values(encodings(records, { high: 2 }))) {
        assertBlocked(runGate(scopedGate, input), /inconsistent ghsaId/);
      }
    }
  });
  await t.test('a prerelease version is accepted as one version', () =>
    assertPass(
      runGate(
        scopedGate,
        pnpmReport(
          [
            advisory(1000010, 'high', [PATH_A], {
              findings: [{ version: '1.0.0-rc.1', paths: [PATH_A] }],
            }),
          ],
          { high: 1 }
        )
      )
    )
  );
  for (const findings of [{}, 'none', null]) {
    await t.test(`findings ${JSON.stringify(findings)} fails closed`, () =>
      assertBlocked(
        runGate(scopedGate, pnpmReport([advisory(1000001, 'high', [], { findings })])),
        /invalid findings/
      )
    );
  }
});

test('repository allowlist covers the picomatch build and test tooling paths only', () => {
  const sentry = 'apps__web>@sentry/nextjs>@rollup/plugin-commonjs>picomatch';
  const vitest = 'apps__web>better-auth>vitest>@vitest/mocker>vite>picomatch';
  const picomatch = paths =>
    advisory(1247710, 'high', [], {
      module_name: 'picomatch',
      findings: paths.map((entry, index) => ({
        version: ['4.0.4', '4.0.7'][index],
        paths: [entry],
      })),
    });
  assertPass(runGate(realGate, pnpmReport([picomatch([sentry, vitest])], { high: 2 })));
  assertBlocked(
    runGate(
      realGate,
      pnpmReport([picomatch([sentry, 'apps__web>micromatch>picomatch'])], { high: 2 })
    ),
    /path not allowlisted: apps__web>micromatch>picomatch/
  );
});
