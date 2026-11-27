import { readFileSync } from 'node:fs';
import { bundlerClosure } from '../bundler-closure.mjs';
import { C1_ADMISSIONS } from '../c1-admissions.mjs';
import { CONNECTION_CONTROL, KERNEL_ANCHOR, LEGACY, LEGACY_PINS } from '../manifest.mjs';
import { installAdmission } from '../rules-admission.mjs';
import { proveSchemaAdmission } from '../rules-schema-admission.mjs';
import { kernelWalk } from '../rules-trust.mjs';
import { gitIdentity, readSchemaTree, schemaTreeFromBlobs } from '../sources.mjs';
import {
  RECEIPT_CALLER,
  RECEIPT_KEY,
  RECEIPT_REEXPORT,
  storageReceiptAdmission,
} from '../storage-receipt-admission.mjs';
import { MIGRATION_JOURNAL, RECEIPT_SQL } from '../storage-receipt-prerequisite.mjs';

const ROOT = new URL('../../../../', import.meta.url);
const WP07_FIXTURES = new URL('../../tests/fixtures/wp07-rate-book/', import.meta.url);
export const SCHEMA = 'packages/database/src/schema';
export const BARREL = `${SCHEMA}/index.ts`;
export const INBOUND = `${SCHEMA}/claim-inbound-documents.ts`;
export const INBOUND_EXPORT = "export * from './claim-inbound-documents';\n";
export const VERIFIER = RECEIPT_KEY.split('#')[0];
export const BINDER = 'packages/database/src/free-start-drafts/context.ts';
export const PRINCIPAL_CONTEXT = 'packages/database/src/principal-context.ts';
export const DB_MANIFEST = 'packages/database/package.json';
export const READER = 'apps/web/src/app/api/documents/document-access-reads.ts';
export const MODEL = 'apps/web/src/app/api/documents/document-access-model.ts';
export const SPLITTER = 'apps/web/src/lib/storage/tenant-prefix.ts';
const SERVICE_ROLE = 'apps/web/src/lib/storage/service-role.ts';
const DB = 'packages/database/src';

export function fixture(file, root = new URL('./fixtures/', import.meta.url)) {
  return readFileSync(new URL(`${file.split('/').at(-1)}.txt`, root), 'utf8');
}

export function edit(tree, changes) {
  const blobs = new Map(tree.blobs);
  const files = new Map(tree.files);
  for (const [file, text] of changes) {
    if (text === null) {
      blobs.delete(file);
      files.delete(file);
    } else {
      blobs.set(file, text);
      files.set(file, { mode: '100644', kind: 'blob' });
    }
  }
  return schemaTreeFromBlobs(blobs, files);
}

// Keep the real kernel and resolver closures, plus the unchanged files used by the B records.
function focusedTree(identity, role, extra = []) {
  const tree = readSchemaTree(ROOT, identity, role);
  const files = new Set([...tree.inputs.keys(), ...extra]);
  for (const key of LEGACY.keys()) {
    for (const file of kernelWalk(tree.graph, key).seen) files.add(file);
  }
  for (const [file] of bundlerClosure(tree).value.files) files.add(file);
  return schemaTreeFromBlobs(new Map([...files].map(file => [file, tree.blobs.get(file)])));
}

export const readerRecord = C1_ADMISSIONS.find(
  ({ id }) => id === 'storage-read-and-inbound-receipt'
);
const readerEdits = [READER, MODEL, SPLITTER];
export const anchor = focusedTree(KERNEL_ANCHOR, 'anchor');
export const main = focusedTree(gitIdentity(ROOT, '2dc457070'), 'base', [
  ...readerRecord.files.map(({ file }) => file).filter(file => !readerEdits.includes(file)),
  READER,
  MODEL,
  SPLITTER,
  SERVICE_ROLE,
  `${DB}/tenant-authority-public.ts`,
]);
export const wp07 = edit(
  main,
  [
    'exchange-rates.ts',
    'exchange-rate-verifications.ts',
    'exchange-rate-checks.ts',
    'index.ts',
  ].map(file => [`${SCHEMA}/${file}`, fixture(file, WP07_FIXTURES)])
);
export const predecessorReceiptSql = [
  'predecessor-schema',
  'receipt',
  'predecessor-publication-and-scope',
]
  .map(part => fixture('0114-' + part + '.sql'))
  .join('');
export const journalEntry = JSON.parse(fixture('0114-journal-entry.json'));
export const journal = (...entries) => JSON.stringify({ entries });
const receiptSql = ['schema', 'receipt', 'publication-and-scope', 'scope-privileges']
  .map(part => fixture(`0114-${part}.sql`))
  .join('');
export const dark = edit(wp07, [
  [BARREL, wp07.sources.get(BARREL) + INBOUND_EXPORT],
  [INBOUND, fixture(INBOUND)],
  [RECEIPT_SQL, receiptSql],
  [MIGRATION_JOURNAL, journal(journalEntry)],
]);

export const readerChanges = readerEdits.map(file => [file, fixture(file)]);
export const receiptChanges = [VERIFIER, RECEIPT_CALLER, RECEIPT_REEXPORT, BINDER].map(file => [
  file,
  fixture(file),
]);
export const storage = edit(dark, [
  ...readerChanges,
  ...receiptChanges,
  [
    `${DB}/claim-inbound-writes.ts`,
    'export const insertClaimInboundDecision = () => {};\nexport const insertClaimReceivedLinks = () => {};\n',
  ],
  [
    `${DB}/free-start-drafts.ts`,
    "export { withPrincipalTenantContext } from './principal-context';\n",
  ],
  [
    PRINCIPAL_CONTEXT,
    "export { withPrincipalTenantContext } from './free-start-drafts/context';\n",
  ],
]);

export function prove(base, candidate, { checkout = candidate, inboundRecord } = {}) {
  return proveSchemaAdmission(
    { anchor, base, candidate },
    LEGACY_PINS,
    checkout.graph,
    checkout.sources,
    undefined,
    undefined,
    inboundRecord
  );
}

export function checkStorageAdmission(base, candidate) {
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
