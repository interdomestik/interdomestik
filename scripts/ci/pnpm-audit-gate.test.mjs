import { test } from 'node:test';

import {
  COMPLETENESS,
  PATH_A,
  PATH_B,
  REAL_SCOPED_PATH,
  SCOPED_ALLOWLIST,
  advisory,
  allowedHigh,
  assertBlocked,
  assertPass,
  encodings,
  makeGate,
  pnpmReport,
  realGate,
  realisticPnpm10Report,
  runGate,
} from './pnpm-audit-fixtures.mjs';

// Authorization, identity, path-scope, duplicate-identity and allowlist-config regressions.

const emptyGate = makeGate({ allowlist: [] });
const scopedGate = makeGate(SCOPED_ALLOWLIST);

test('unknown high and critical advisories block', () => {
  assertBlocked(runGate(emptyGate, pnpmReport([advisory(3000001, 'high')])), /3000001 \(high\)/);
  assertBlocked(
    runGate(emptyGate, pnpmReport([advisory(3000002, 'critical')], {}, { keyed: true })),
    /3000002 \(critical\)/
  );
});

test('invalid advisory identity, severity or module is rejected, not fallen through', async t => {
  const cases = {
    'empty ghsaId with valid id': advisory(3000030, 'moderate', [PATH_A], { ghsaId: '' }),
    'numeric ghsaId': advisory(3000031, 'moderate', [PATH_A], { ghsaId: 42 }),
    'null ghsaId': advisory(3000032, 'moderate', [PATH_A], { ghsaId: null }),
    'negative id': advisory(-1, 'moderate'),
    'fractional id': advisory(1.5, 'moderate'),
    'empty id': advisory('', 'moderate'),
    'null severity': advisory(3000033, null),
    'uppercase severity': advisory(3000034, 'HIGH'),
    'missing module_name': advisory(3000035, 'moderate', [PATH_A], { module_name: undefined }),
    'empty module_name': advisory(3000036, 'moderate', [PATH_A], { module_name: '' }),
  };
  for (const [name, entry] of Object.entries(cases)) {
    await t.test(name, () => assertBlocked(runGate(emptyGate, pnpmReport([entry]))));
  }
  await t.test('invalid ghsaId does not fall through to an allowlisted id', () =>
    assertBlocked(
      runGate(scopedGate, pnpmReport([advisory(1000010, 'high', [PATH_A], { ghsaId: '' })])),
      /invalid ghsaId/
    )
  );
});

test('consistent repeated records count once and every path is still checked', async t => {
  for (const [encoding, input] of Object.entries(
    encodings([allowedHigh(), allowedHigh()], { high: 1 })
  )) {
    await t.test(`consistent copies on allowed path pass (${encoding})`, () =>
      assertPass(runGate(scopedGate, input))
    );
  }
  const splitPaths = [advisory(1000010, 'high', [PATH_A]), advisory(1000010, 'high', [PATH_B])];
  const wrongFirst = [advisory(1000010, 'high', [PATH_B]), advisory(1000010, 'high', [PATH_A])];
  for (const records of [splitPaths, wrongFirst]) {
    for (const [encoding, input] of Object.entries(encodings(records, { high: 1 }))) {
      await t.test(`one copy on a wrong path blocks (${encoding})`, () =>
        assertBlocked(runGate(scopedGate, input), /path not allowlisted: .*dep-b/)
      );
    }
  }
});

test('duplicate identities with conflicting severity or module are invalid', async t => {
  const wrongModerate = advisory(1000010, 'moderate', [PATH_B]);
  const cases = {
    'allowed high + wrong-path moderate': [allowedHigh(), wrongModerate],
    'wrong-path moderate + allowed high': [wrongModerate, allowedHigh()],
    'unknown high + moderate': [advisory(3000009, 'high'), advisory(3000009, 'moderate')],
    'conflicting module': [
      allowedHigh(),
      advisory(1000010, 'high', [PATH_A], { module_name: 'other-lib' }),
    ],
    'shared ghsaId with conflicting severity': [
      advisory(4000012, 'high', [PATH_A], { ghsaId: 'GHSA-scop-ed00-0012' }),
      advisory(4000013, 'critical', [PATH_A], { ghsaId: 'GHSA-scop-ed00-0012' }),
    ],
  };
  for (const [name, records] of Object.entries(cases)) {
    for (const [encoding, input] of Object.entries(encodings(records))) {
      await t.test(`${name} (${encoding})`, () =>
        assertBlocked(runGate(scopedGate, input), /conflicting severity\/module/)
      );
    }
  }
});

test('path-scoped allowlist entries pass only on exact, complete path matches', () => {
  assertPass(runGate(scopedGate, pnpmReport([advisory(1000010, 'high', [PATH_A])])));
  assertPass(
    runGate(
      scopedGate,
      pnpmReport([
        advisory(1000011, 'critical', [PATH_A], {
          findings: [
            { version: '1.0.0', paths: [PATH_A] },
            { version: '2.0.0', paths: [PATH_B] },
          ],
        }),
      ])
    )
  );
  assertPass(
    runGate(
      scopedGate,
      pnpmReport([advisory(4000012, 'high', [PATH_A], { ghsaId: 'GHSA-scop-ed00-0012' })])
    )
  );
});

test('path-scoped IDs never gain unconditional permission', async t => {
  const cases = {
    'wrong path': advisory(1000010, 'high', [PATH_B]),
    'mixed allowed and forbidden paths': advisory(1000010, 'high', [PATH_A, PATH_B]),
    'empty findings': advisory(1000010, 'high', [PATH_A], { findings: [] }),
    'missing findings': advisory(1000010, 'high', [PATH_A], { findings: undefined }),
    'empty paths': advisory(1000010, 'high', []),
    'empty string path': advisory(1000010, 'high', ['']),
    'non-string path': advisory(1000010, 'high', [42]),
    'one of multiple findings lacks paths': advisory(1000010, 'high', [PATH_A], {
      findings: [{ version: '1.0.0', paths: [PATH_A] }, { version: '1.0.1' }],
    }),
    'ghsaId scoped entry on wrong path': advisory(4000012, 'high', [PATH_B], {
      ghsaId: 'GHSA-scop-ed00-0012',
    }),
  };
  for (const [name, entry] of Object.entries(cases)) {
    await t.test(name, () => assertBlocked(runGate(scopedGate, pnpmReport([entry]))));
  }
});

test('unconditional file entries and CLI arguments behave as before', () => {
  assertPass(runGate(scopedGate, pnpmReport([advisory(1000001, 'critical', [PATH_B])])));
  assertPass(runGate(scopedGate, pnpmReport([advisory(1000002, 'high', [], { findings: [] })])));

  const unknown = pnpmReport([advisory(3000010, 'high')]);
  assertBlocked(runGate(scopedGate, unknown));
  assertPass(runGate(scopedGate, unknown, ['3000010']));
  assertPass(runGate(scopedGate, pnpmReport([advisory(1000010, 'high', [PATH_B])]), ['1000010']));
  assertBlocked(runGate(scopedGate, unknown, ['']));
});

test('identifier semantics are not broadened to github_advisory_id', () => {
  assertBlocked(runGate(scopedGate, pnpmReport([advisory(1000003, 'high')])), /1000003/);
});

test('malformed allowlist configuration fails closed', async t => {
  const clean = pnpmReport([]);
  const cases = {
    'invalid JSON': '{ not json',
    'unsupported shape': { unexpected: [] },
    'object without path': { allowlist: [{ id: '1000010' }] },
    'empty path': { allowlist: [{ id: '1000010', path: '' }] },
    'empty paths array': { allowlist: [{ id: '1000010', paths: [] }] },
    'path and paths': { allowlist: [{ id: '1000010', path: PATH_A, paths: [PATH_B] }] },
    'missing id': { allowlist: [{ path: PATH_A }] },
    'invalid scalar': { allowlist: [true] },
  };
  for (const [name, allowlist] of Object.entries(cases)) {
    await t.test(name, () => assertBlocked(runGate(makeGate(allowlist), clean), /allowlist/));
  }
  assertPass(runGate(makeGate(undefined), clean));
});

test('repository allowlist loads and keeps its scoped entries scoped', () => {
  assertPass(runGate(realGate, pnpmReport([])));
  assertPass(runGate(realGate, realisticPnpm10Report()));
  assertPass(runGate(realGate, pnpmReport([advisory(1116008, 'high', [REAL_SCOPED_PATH])])));
  assertBlocked(runGate(realGate, pnpmReport([advisory(1116008, 'high', [PATH_A])])));
  assertPass(runGate(realGate, pnpmReport([advisory(1112810, 'high', [PATH_A])])));
  assertBlocked(
    runGate(realGate, pnpmReport([advisory(1116008, 'high', [REAL_SCOPED_PATH])], { high: 2 })),
    COMPLETENESS
  );
});
