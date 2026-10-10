import { test } from 'node:test';

import {
  COMPLETENESS,
  ERROR_VALUES,
  SCOPED_ALLOWLIST,
  advisory,
  allowedHigh,
  assertBlocked,
  assertPass,
  encodings,
  makeGate,
  ndjson,
  pnpmReport,
  pnpmReportWithout,
  realisticPnpm10Report,
  runGate,
  streamRecords,
  updateAction,
} from './pnpm-audit-fixtures.mjs';

// Parser, report-shape, count-completeness and record-stream regressions.

const emptyGate = makeGate({ allowlist: [] });
const scopedGate = makeGate(SCOPED_ALLOWLIST);

test('authentic pnpm10 clean reports pass (array and keyed advisories, update actions)', () => {
  assertPass(runGate(emptyGate, pnpmReport([])));
  assertPass(runGate(emptyGate, pnpmReport([], {}, { keyed: true })));
  const resolved = [advisory(1239948, 'moderate')];
  assertPass(
    runGate(emptyGate, pnpmReport([], {}, { keyed: true, actions: [updateAction(resolved)] }))
  );
});

test('authentic pnpm10 moderate/low report passes without overconstraining counts', () => {
  assertPass(runGate(emptyGate, realisticPnpm10Report()));
  const advisories = [
    advisory(1239948, 'moderate'),
    advisory(1239949, 'moderate'),
    advisory(1239950, 'low'),
  ];
  assertPass(runGate(emptyGate, pnpmReport(advisories, { moderate: 13, low: 2 })));
  assertPass(runGate(emptyGate, pnpmReport(advisories, {}, { keyed: true })));
});

test('invalid, unsupported, error and incomplete inputs fail closed', async t => {
  const truncated = pnpmReport([advisory(3000003, 'moderate')]);
  const missingCritical = JSON.stringify({
    actions: [],
    advisories: {},
    muted: [],
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0 } },
  });
  const cases = {
    empty: '',
    whitespace: '  \n\t\n',
    null: 'null',
    number: '42',
    string: '"report"',
    boolean: 'true',
    'empty array': '[]',
    'empty object': '{}',
    'missing metadata': JSON.stringify({ actions: [], advisories: {}, muted: [] }),
    'missing vulnerabilities': JSON.stringify({
      actions: [],
      advisories: {},
      muted: [],
      metadata: { dependencies: 1 },
    }),
    'missing severity count': missingCritical,
    'missing advisories': pnpmReportWithout('advisories'),
    'advisories scalar': pnpmReport([]).replace('"advisories": []', '"advisories": "none"'),
    'pnpm error record': JSON.stringify({
      error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE', message: 'endpoint responded 500' },
    }),
    'registry error body': JSON.stringify({ code: 'E500', summary: 'registry unavailable' }),
    'stream error record': ndjson([{ type: 'error', data: 'registry unavailable' }]),
    'truncated pretty JSON': truncated.slice(0, -20),
    'truncated single line': JSON.stringify(JSON.parse(truncated)).slice(0, -5),
    'unknown advisory severity': pnpmReport([advisory(3000004, 'severe')]),
    'unknown summary severity': pnpmReport([], { severe: 1 }),
    'negative count': pnpmReport([], { low: -1 }),
    'missing identity': pnpmReport([{ severity: 'moderate', module_name: 'x', findings: [] }]),
    'non-object advisory': pnpmReport(['GHSA-xxxx']),
  };
  for (const [name, input] of Object.entries(cases)) {
    await t.test(name, () => assertBlocked(runGate(emptyGate, input)));
  }
});

test('pnpm object reports require actions and empty muted arrays', async t => {
  const resolved = [advisory(1239948, 'moderate')];
  const critical = advisory(3000012, 'critical');
  const cases = {
    'missing actions': [pnpmReportWithout('actions'), /actions array/],
    'actions object': [pnpmReport([], {}, { actions: {} }), /actions array/],
    'actions null': [pnpmReport([], {}, { actions: null }), /actions array/],
    'scalar action': [pnpmReport([], {}, { actions: ['update'] }), /not an object/],
    'action without action/resolves': [
      pnpmReport([], {}, { actions: [{ module: 'example-lib' }] }),
      /action\/resolves/,
    ],
    'action with scalar resolves': [
      pnpmReport([], {}, { actions: [{ ...updateAction(resolved), resolves: 'x' }] }),
      /action\/resolves/,
    ],
    'missing muted': [pnpmReportWithout('muted'), /muted array/],
    'muted object': [pnpmReport([], {}, { muted: {} }), /muted array/],
    'muted string': [pnpmReport([], {}, { muted: 'none' }), /muted array/],
    'muted null': [pnpmReport([], {}, { muted: null }), /muted array/],
    'nonempty muted critical': [pnpmReport([], {}, { muted: [critical] }), /muting is unsupported/],
    'nonempty muted low': [
      pnpmReport([], {}, { muted: [advisory(3000013, 'low')] }),
      /muting is unsupported/,
    ],
  };
  for (const [name, [input, pattern]] of Object.entries(cases)) {
    await t.test(name, () => assertBlocked(runGate(emptyGate, input), pattern));
  }
});

test('pnpm object reports with explicit error fields fail even with clean counts', async t => {
  const resolved = [advisory(1239948, 'moderate')];
  for (const [field, value] of Object.entries(ERROR_VALUES)) {
    const pattern = new RegExp(`explicit ${field} field`);
    await t.test(`top-level ${field}`, () =>
      assertBlocked(runGate(emptyGate, pnpmReport([], {}, { extra: { [field]: value } })), pattern)
    );
    await t.test(`metadata ${field}`, () =>
      assertBlocked(
        runGate(emptyGate, pnpmReport([], {}, { metadataExtra: { [field]: value } })),
        pattern
      )
    );
    await t.test(`action ${field}`, () =>
      assertBlocked(
        runGate(
          emptyGate,
          pnpmReport([], {}, { actions: [{ ...updateAction(resolved), [field]: value }] })
        ),
        pattern
      )
    );
  }
  await t.test('top-level error: null', () =>
    assertBlocked(runGate(emptyGate, pnpmReport([], {}, { extra: { error: null } })))
  );
});

test('summary claiming high/critical without advisory details fails', () => {
  const moderate = [advisory(3000005, 'moderate')];
  assertBlocked(
    runGate(emptyGate, pnpmReport(moderate, { high: 1 })),
    /summary reports 1 high but 0 distinct high/
  );
  assertBlocked(
    runGate(emptyGate, pnpmReport(moderate, { critical: 2 })),
    /summary reports 2 critical but 0 distinct critical/
  );
  assertBlocked(
    runGate(emptyGate, ndjson(streamRecords(moderate, { overrides: { high: 1 } }))),
    /summary reports 1 high but 0 distinct high/
  );
});

test('conservative policy: blocking summary must equal distinct blocking identities', async t => {
  const cases = {
    'high summary 2, one allowlisted high': [[allowedHigh()], { high: 2 }],
    'high summary 0, one allowlisted high': [[allowedHigh()], { high: 0 }],
    'high summary 2, two identical copies of one allowlisted high': [
      [allowedHigh(), allowedHigh()],
      { high: 2 },
    ],
    'critical summary 0, one unconditionally allowlisted critical': [
      [advisory(1000001, 'critical')],
      { critical: 0 },
    ],
    'critical summary 2, one unconditionally allowlisted critical': [
      [advisory(1000001, 'critical')],
      { critical: 2 },
    ],
  };
  for (const [name, [advisories, overrides]] of Object.entries(cases)) {
    for (const [encoding, input] of Object.entries(encodings(advisories, overrides))) {
      await t.test(`${name} (${encoding})`, () =>
        assertBlocked(runGate(scopedGate, input), COMPLETENESS)
      );
    }
  }
  await t.test('keyed pnpm object shortfall', () =>
    assertBlocked(
      runGate(scopedGate, pnpmReport([allowedHigh()], { high: 2 }, { keyed: true })),
      COMPLETENESS
    )
  );
});

test('complete NDJSON and JSON-array streams are accepted; broken streams are not', () => {
  // Advisory fixtures carry prose fields (overview, recommendation, references): allowed.
  const moderate = [advisory(3000006, 'moderate'), advisory(3000007, 'low')];
  const complete = ndjson(streamRecords(moderate));
  assertPass(runGate(emptyGate, complete));
  assertPass(runGate(emptyGate, JSON.stringify(streamRecords(moderate))));
  assertPass(runGate(emptyGate, ndjson(streamRecords([]))));

  assertBlocked(runGate(emptyGate, ndjson(streamRecords([advisory(3000008, 'high')]))));
  assertBlocked(
    runGate(emptyGate, ndjson(streamRecords(moderate, { summary: false }))),
    /no auditSummary/
  );
  assertBlocked(runGate(emptyGate, complete.trimEnd().slice(0, -10)), /not valid JSON or NDJSON/);
  const lines = complete.trimEnd().split('\n');
  lines.splice(1, 0, '{"type":"auditAdvisory","data":');
  assertBlocked(runGate(emptyGate, lines.join('\n')), /not valid JSON or NDJSON/);
  assertBlocked(
    runGate(emptyGate, ndjson([...streamRecords(moderate), ...streamRecords([], {})])),
    /follows auditSummary/
  );
  assertBlocked(
    runGate(emptyGate, ndjson([{ type: 'auditAdvisory', data: {} }, ...streamRecords([])])),
    /has no advisory/
  );
  assertBlocked(
    runGate(emptyGate, ndjson([{ type: 'auditAdvisory' }, ...streamRecords([])])),
    /has no data/
  );
});

test('legacy auditAction records are unsupported and fail closed', async t => {
  const moderate = [advisory(3000021, 'moderate')];
  const clean = streamRecords(moderate);
  const actions = {
    'missing data': { type: 'auditAction' },
    'scalar data': { type: 'auditAction', data: 'update' },
    'error data': { type: 'auditAction', data: { error: 'registry unavailable' } },
    'well-formed data': { type: 'auditAction', data: updateAction(moderate) },
  };
  for (const [name, record] of Object.entries(actions)) {
    const before = [record, ...clean];
    const between = [clean[0], record, clean[1]];
    await t.test(`${name} before clean summary (NDJSON)`, () =>
      assertBlocked(runGate(emptyGate, ndjson(before)), /auditAction/)
    );
    await t.test(`${name} before clean summary (JSON array)`, () =>
      assertBlocked(runGate(emptyGate, JSON.stringify(before)), /auditAction/)
    );
    await t.test(`${name} between advisory and summary`, () =>
      assertBlocked(runGate(emptyGate, ndjson(between)), /auditAction/)
    );
  }
  await t.test('single auditAction object', () =>
    assertBlocked(runGate(emptyGate, JSON.stringify(actions['well-formed data'])), /auditAction/)
  );
});

test('stream records with explicit error fields fail even with clean summaries', async t => {
  for (const [field, value] of Object.entries(ERROR_VALUES)) {
    const pattern = new RegExp(`explicit ${field} field`);
    const mutations = {
      'summary record': records => Object.assign(records.at(-1), { [field]: value }),
      'summary data': records => Object.assign(records.at(-1).data, { [field]: value }),
      'advisory record': records => Object.assign(records[0], { [field]: value }),
      'advisory data': records => Object.assign(records[0].data, { [field]: value }),
    };
    for (const [where, mutate] of Object.entries(mutations)) {
      const records = streamRecords([advisory(3000020, 'moderate')]);
      mutate(records);
      await t.test(`${where} ${field}`, () =>
        assertBlocked(runGate(emptyGate, ndjson(records)), pattern)
      );
    }
  }
});
