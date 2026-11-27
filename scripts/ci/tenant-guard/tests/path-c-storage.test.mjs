import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { C1_ADMISSIONS } from '../c1-admissions.mjs';
import { CONNECTION_CONTROL, CONTRACTS } from '../manifest.mjs';
import { createModuleGraph } from '../modules.mjs';
import { installAdmission } from '../rules-admission.mjs';
import { evaluate } from '../rules.mjs';
import {
  RECEIPT_CALLER,
  RECEIPT_REEXPORT,
  storageReceiptAdmission,
} from '../storage-receipt-admission.mjs';
import { MIGRATION_JOURNAL, RECEIPT_SQL } from '../storage-receipt-prerequisite.mjs';
import {
  BINDER,
  DB_MANIFEST,
  INBOUND,
  MODEL,
  PRINCIPAL_CONTEXT,
  READER,
  SPLITTER,
  VERIFIER,
  dark,
  edit,
  fixture,
  journal,
  journalEntry,
  main,
  prove,
  readerChanges,
  readerRecord,
  receiptChanges,
  storage,
  wp07,
} from './path-c-test-support.mjs';

function check(base, candidate) {
  const ctx = {
    graph: candidate.graph,
    sources: candidate.sources,
    violations: [],
    telemetry: {},
    schemaAdmission: prove(base, candidate),
  };
  installAdmission(ctx, [readerRecord]);
  return {
    proof: ctx.schemaAdmission,
    reader: ctx.telemetry.c1Admissions === 1,
    receipt: storageReceiptAdmission(ctx, candidate, CONNECTION_CONTROL),
    violations: ctx.violations,
  };
}

function checkReceiptControls(receipt) {
  const transaction = receipt.admin.parent.parent;
  assert.ok(ts.isCallExpression(transaction));
  const callback = transaction.arguments[0];
  assert.ok(ts.isArrowFunction(callback) && ts.isBlock(callback.body));
  const [role, rls, tenant, accessTenant, actor] = callback.body.statements
    .slice(0, 5)
    .map(statement => statement.expression.expression.arguments[0].template);

  assert.ok(ts.isNoSubstitutionTemplateLiteral(role));
  assert.ok(ts.isNoSubstitutionTemplateLiteral(rls));
  assert.ok(ts.isTemplateExpression(tenant));
  assert.ok(ts.isTemplateExpression(accessTenant));
  assert.ok(ts.isTemplateExpression(actor));
  assert.equal(actor.templateSpans.length, 3);
  const [firstActorSpan, secondActorSpan, lastActorSpan] = actor.templateSpans;
  assert.ok(ts.isTemplateMiddle(firstActorSpan.literal));
  assert.ok(ts.isTemplateMiddle(secondActorSpan.literal));
  assert.ok(ts.isTemplateTail(lastActorSpan.literal));

  const groups = [
    [role],
    [rls],
    [tenant.head],
    [accessTenant.head],
    [actor.head, firstActorSpan.literal, secondActorSpan.literal],
  ];
  assert.deepEqual(
    groups.map(group => group.filter(node => receipt.controls.has(node)).length),
    [1, 1, 1, 1, 3]
  );
  assert.equal(receipt.controls.size, 7);
}

function checkBoth(result, enabled) {
  assert.equal(result.reader, enabled);
  assert.equal(Boolean(result.receipt), enabled, JSON.stringify(result.violations));
  if (enabled) {
    checkReceiptControls(result.receipt);
    assert.equal(result.receipt.admin.getText(), 'dbAdmin');
    assert.equal(result.receipt.caller.getText(), 'recordClaimInboundObjectVerification');
  }
}

const readerBaseRefusal = /storage reader requires exact WP-12.1 schema and 0114/u;
const receiptBaseRefusal = /storage receipt requires exact WP-12.1 schema and 0114/u;
const has = ({ violations }, pattern) => violations.some(({ detail }) => pattern.test(detail));

test('the exact B reader on W is refused even though the W schema passes', () => {
  const result = check(wp07, edit(wp07, readerChanges));
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBoth(result, false);
  assert.equal(result.violations.length, 1);
  assert.ok(has(result, readerBaseRefusal));
});

test('exact D+B on W cannot satisfy its own first-parent prerequisite', () => {
  const result = check(wp07, storage);
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBoth(result, false);
  assert.ok(has(result, readerBaseRefusal));
  assert.ok(has(result, receiptBaseRefusal));
});

test('D on W passes with the staff-draft reader and the verifier dormant', () => {
  const result = check(wp07, dark);
  assert.equal(result.proof.ok, true, result.proof.reason);
  checkBoth(result, false);
  assert.deepEqual(result.violations, []);
  const ctx = { graph: dark.graph, schemaAdmission: result.proof, telemetry: {}, violations: [] };
  installAdmission(ctx);
  const unit = dark.graph
    .sourceFileOf(READER)
    .statements.find(node => node.name?.text === 'readLocalDocumentAccess');
  assert.ok(unit);
  assert.equal(
    ctx.c1Admitted(
      {
        file: READER,
        sourceFile: unit.getSourceFile(),
        declarations: new Map([[unit.name.text, unit]]),
      },
      unit
    ),
    true
  );
});

test('B on D and an ordinary follow-up on B pass both admissions', () => {
  const later = edit(storage, [
    [
      MIGRATION_JOURNAL,
      journal(journalEntry, {
        ...journalEntry,
        idx: 115,
        tag: '0115_case_tenant_binding',
        when: 1795798261577,
      }),
    ],
    ['apps/web/src/path-c-followup.ts', 'export const followup = true;\n'],
  ]);
  for (const [base, candidate] of [
    [dark, storage],
    [storage, later],
    [later, later],
  ]) {
    const result = check(base, candidate);
    assert.equal(result.proof.ok, true, result.proof.reason);
    checkBoth(result, true);
    assert.deepEqual(result.violations, []);
  }
});

for (const [label, changes] of [
  ['partial D', [[INBOUND, null]]],
  ['missing 0114 SQL', [[RECEIPT_SQL, null]]],
  ['empty 0114 SQL', [[RECEIPT_SQL, '']]],
  ['one-byte change in 0114 SQL', [[RECEIPT_SQL, `${dark.blobs.get(RECEIPT_SQL)} `]]],
  ['missing journal', [[MIGRATION_JOURNAL, null]]],
  ['empty journal', [[MIGRATION_JOURNAL, '']]],
  ['malformed journal', [[MIGRATION_JOURNAL, '{"entries":']]],
  ['missing 0114 journal entry', [[MIGRATION_JOURNAL, journal()]]],
  [
    'altered 0114 journal entry',
    [[MIGRATION_JOURNAL, journal({ ...journalEntry, when: journalEntry.when + 1 })]],
  ],
  [
    'duplicate 0114 tag',
    [[MIGRATION_JOURNAL, journal(journalEntry, { ...journalEntry, idx: 115 })]],
  ],
  [
    'duplicate 0114 index',
    [[MIGRATION_JOURNAL, journal(journalEntry, { ...journalEntry, tag: '0114_wrong' })]],
  ],
]) {
  test(`${label} on the first parent withholds both permissions from an exact B candidate`, () => {
    const result = check(edit(dark, changes), storage);
    checkBoth(result, false);
    assert.ok(has(result, readerBaseRefusal));
    assert.ok(has(result, receiptBaseRefusal));
  });
}

for (const file of readerRecord.files.map(({ file }) => file)) {
  test(`one changed byte in ${file} withholds the reader admission`, () => {
    assert.equal(
      check(dark, edit(storage, [[file, `${storage.sources.get(file)} `]])).reader,
      false
    );
  });
}

for (const [file, text] of receiptChanges) {
  test(`the mandatory receipt check refuses drift in ${file} even on W and with the predecessor reader`, () => {
    const predecessor = edit(
      storage,
      readerChanges.map(([file]) => [file, main.sources.get(file)])
    );
    for (const [base, candidate] of [
      [dark, storage],
      [wp07, storage],
      [wp07, predecessor],
    ]) {
      const result = check(base, edit(candidate, [[file, `${text} `]]));
      assert.equal(result.receipt, null);
      assert.ok(
        result.violations.some(({ detail }) => detail === `storage receipt byte mismatch: ${file}`)
      );
    }
  });
}

for (const [file, before, after] of [
  [VERIFIER, "principal?.role !== 'staff'", "principal?.role !== 'admin'"],
  [VERIFIER, 'set local row_security = on', 'set local row_security = off'],
  [VERIFIER, 'app.current_access_tenant_id', 'app.current_tenant_id'],
  [VERIFIER, 'principal.userId', 'observed.decisionId'],
  [VERIFIER, 'principal.role', 'principal.userId'],
  [VERIFIER, "principal.branchId ?? ''", 'principal.branchId'],
  [VERIFIER, "principal.branchId ?? ''}, true", "principal.branchId ?? ''}, false"],
  [
    VERIFIER,
    'return dbAdmin.transaction',
    'await dbAdmin.transaction(async () => false);\n  return dbAdmin.transaction',
  ],
  [BINDER, 'app.current_actor_branch_id', 'app.current_actor_role'],
  [RECEIPT_CALLER, 'fileSize: bytes.byteLength,', 'fileSize: decision.fileSize,'],
  [RECEIPT_CALLER, 'return recordClaimInboundObjectVerification(', 'return invokeReceipt('],
  [RECEIPT_REEXPORT, "from './claim-inbound-verification'", "from './other-command'"],
]) {
  test(`the receipt guard refuses changing ${before}`, () => {
    const original = storage.sources.get(file);
    assert.ok(original.includes(before));
    const result = check(dark, edit(storage, [[file, original.replace(before, after)]]));
    assert.equal(result.receipt, null);
    assert.ok(
      result.violations.some(({ detail }) => detail === `storage receipt byte mismatch: ${file}`)
    );
  });
}

test('exact receipt bytes still require the reviewed resolver bindings', () => {
  const redirected = edit(storage, [
    [PRINCIPAL_CONTEXT, 'export const withPrincipalTenantContext = () => {};\n'],
  ]);
  const redirectResult = check(dark, redirected);
  assert.equal(redirectResult.proof.ok, true, redirectResult.proof.reason);
  assert.equal(redirectResult.receipt, null);
  assert.ok(
    redirectResult.violations.some(
      ({ rule, detail }) =>
        rule === 'R-a' &&
        detail ===
          `storage receipt binding mismatch: ${RECEIPT_CALLER} imports withPrincipalTenantContext from @interdomestik/database/free-start-drafts`
    )
  );
  const manifest = JSON.parse(storage.blobs.get(DB_MANIFEST));
  delete manifest.exports['./claim-evidence-object-lock'];
  const missingExport = edit(storage, [[DB_MANIFEST, JSON.stringify(manifest)]]);
  const missingResult = check(dark, missingExport);
  assert.equal(missingResult.proof.ok, false, missingResult.proof.reason);
  assert.equal(missingResult.receipt, null);
  assert.ok(has(missingResult, /storage receipt binding mismatch/u));
});

test('the approved WP-07 C3 contract still requires one counted raw execution', () => {
  const file = 'packages/domain-membership-billing/src/port/rate-check-context.ts';
  const unit = 'lockRateCheckScope';
  const contract = {
    file,
    unit,
    kinds: { execute: 1 },
    sha256: 'f4aec0a4a3cb4a95bbc7837d9b1b98b381c87639e084120fc09908a92ecab81b',
  };
  const scan = sources =>
    evaluate({
      sources,
      trusted: new Map(),
      graph: createModuleGraph({ sources, packages: new Map() }),
      contracts: [contract],
      legacyPins: null,
    });
  const before = scan(new Map());
  assert.equal(before.violations.length, 1);
  assert.ok(has(before, /execute: contract admits 1, source has 0/u));
  const exact = fixture('lock-rate-check-scope.ts');
  assert.deepEqual(scan(new Map([[file, exact]])).violations, []);
  const drift = scan(new Map([[file, exact.replace('tx.execute', 'tx.query')]]));
  assert.ok(has(drift, /execute: contract admits 1, source has 0/u));
});

test('the C1 successor binds the reader, model and splitter without changing either GET contract', () => {
  const predecessor = C1_ADMISSIONS.find(({ id }) => id === 'documents-staff-draft-denial-2026-11');
  assert.deepEqual(readerRecord.sinkEdges, [
    ...predecessor.sinkEdges,
    {
      file: READER,
      unit: 'readCrossGrantDocumentAccess',
      sink: 'apps/web/src/app/api/documents/cross-tenant-document-lookup.ts#lookupCrossGrantDoc',
    },
  ]);
  assert.deepEqual(readerRecord.files.find(({ file }) => file === MODEL).units, [
    'getPolymorphicStorageFamily',
    'getPolymorphicDocumentBucket',
  ]);
  assert.deepEqual(readerRecord.files.find(({ file }) => file === SPLITTER).units, [
    'assertTenantStoragePath',
    'splitCanonicalStoragePath',
  ]);
  const contracts = CONTRACTS.filter(
    ({ file, unit }) => file.includes('/api/documents/[id]/') && unit === 'GET'
  );
  assert.deepEqual(
    contracts.map(({ kinds, sha256 }) => [kinds, sha256]),
    [
      [{ 'value:db': 2 }, '4985fd403c1066179bc0754624f9c942e4401751727409b771bc8ceff173916f'],
      [{ 'value:db': 2 }, '7d2788c7883d701ab445f80d0b8959291088d1c7f6abae2ec10e871a493ed419'],
    ]
  );
});
