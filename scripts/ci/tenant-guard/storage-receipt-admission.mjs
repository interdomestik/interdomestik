import ts from 'typescript';
import { originKey } from './modules.mjs';
import { sha256 } from './rules-digest.mjs';
import { storageReceiptPrerequisiteProblem } from './storage-receipt-prerequisite.mjs';
import { fingerprint } from './syntax.mjs';

const DB = 'packages/database/src';
export const RECEIPT_ADMIN = `${DB}/db.ts#dbAdmin`;
const VERIFIER = `${DB}/claim-inbound-verification.ts`;
const COMMAND = 'recordClaimInboundObjectVerification';
export const RECEIPT_KEY = `${VERIFIER}#${COMMAND}`;
export const RECEIPT_CALLER =
  'apps/web/src/features/admin/claims/actions/inbound-evidence-upload.ts';
export const RECEIPT_REEXPORT = `${DB}/claim-evidence-object-lock.ts`;
const BINDER = `${DB}/free-start-drafts/context.ts`;
const STORAGE = 'apps/web/src/lib/storage/service-role.ts';
const OBJECT_LOCK = '@interdomestik/database/claim-evidence-object-lock';
const BINDER_NAME = 'bindTenantTransactionPrincipal';
const RECEIPT_UNIT = '198f43ef997e24406448c377e1d53bb01a6f38ebb148f78574592e7a47c45539';
const IMAGES = new Map([
  [VERIFIER, '93a13733b266647ea0c765d962e3c5ead1e1adb5c156032d01ad88bab499ff1f'],
  [RECEIPT_CALLER, 'fe3c6b8ed3ec2477bde0e1070fbdace212410eb86be0fc01ce61042d7144f931'],
  [RECEIPT_REEXPORT, '5373364cf020452a3be025098197ec09c840c3d1691865fb97b4b7a2965ffaf2'],
  [BINDER, 'd44138e0bcfa17b09fc40f1a26ceaa3dfa7897d653e415d59942a6358e7fbcae'],
]);

const BINDINGS = [
  [VERIFIER, './db', 'dbAdmin', `${DB}/db.ts`],
  [VERIFIER, './free-start-drafts/context', BINDER_NAME, BINDER],
  [VERIFIER, './tenant-authority', 'readTenantAuthority', `${DB}/tenant-authority.ts`],
  [RECEIPT_REEXPORT, './claim-inbound-verification', COMMAND, VERIFIER],
  [
    RECEIPT_REEXPORT,
    './claim-inbound-writes',
    'insertClaimInboundDecision',
    `${DB}/claim-inbound-writes.ts`,
  ],
  [
    RECEIPT_REEXPORT,
    './claim-inbound-writes',
    'insertClaimReceivedLinks',
    `${DB}/claim-inbound-writes.ts`,
  ],
  [RECEIPT_CALLER, OBJECT_LOCK, COMMAND, VERIFIER, [RECEIPT_REEXPORT]],
  [RECEIPT_CALLER, '@/lib/storage/service-role', 'downloadTenantObject', STORAGE],
  [RECEIPT_CALLER, '@/lib/storage/service-role', 'uploadTenantObject', STORAGE],
  [
    RECEIPT_CALLER,
    '@interdomestik/database/free-start-drafts',
    'withPrincipalTenantContext',
    BINDER,
    [`${DB}/free-start-drafts.ts`],
  ],
  [
    RECEIPT_CALLER,
    '@interdomestik/database/tenant-authority',
    'readTenantAuthority',
    `${DB}/tenant-authority.ts`,
    [`${DB}/tenant-authority.ts`, `${DB}/tenant-authority-public.ts`],
  ],
];

function bindingProblem(graph) {
  for (const [file, specifier, symbol, origin, targets = [origin]] of BINDINGS) {
    const { files } = graph.resolveSpecifier(file, specifier);
    const resolved = graph.resolveImport(file, specifier, symbol);
    if (
      files.length !== targets.length ||
      !files.every(file => targets.includes(file)) ||
      resolved.length !== targets.length ||
      !resolved.every(value => originKey(value) === `${origin}#${symbol}`)
    )
      return `${file} imports ${symbol} from ${specifier}`;
  }
  for (const file of [VERIFIER, BINDER, RECEIPT_REEXPORT])
    if (graph.resolveSpecifier(file, 'drizzle-orm').external !== 'drizzle-orm')
      return `${file} imports SQL from drizzle-orm`;
  return null;
}

function commandSites(source) {
  const unit = source.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === COMMAND
  );
  if (!unit || sha256(fingerprint(unit, source)) !== RECEIPT_UNIT) return null;
  // The exact fingerprint fixes the direct transaction, four tenant/role controls, principal
  // binder on the same transaction, and the parameterized receipt call with one boolean result.
  // Retain only the AST nodes for the five otherwise prohibited sites.
  const transaction = unit.body.statements.at(-1).expression;
  const controls = transaction.arguments[0].body.statements.slice(0, 4).map(statement => {
    const template = statement.expression.expression.arguments[0].template;
    return ts.isTemplateExpression(template) ? template.head : template;
  });
  return { admin: transaction.expression.expression, controls: new Set(controls) };
}

export function storageReceiptAdmission(ctx, candidate) {
  const { graph, sources, violations, schemaAdmission } = ctx;
  if (!sources.has(VERIFIER) && !candidate?.files.has(VERIFIER)) return null;
  const refuse = detail => {
    violations.push({ rule: 'R-a', file: VERIFIER, line: 1, unit: COMMAND, detail });
    return null;
  };
  for (const [file, hash] of IMAGES) {
    const source = graph.sourceFileOf(file);
    if (!source || sha256(source.text) !== hash)
      return refuse(`storage receipt byte mismatch: ${file}`);
  }
  const objectLockExport =
    candidate?.packages.get('@interdomestik/database')?.exports?.['./claim-evidence-object-lock'];
  if (objectLockExport !== './src/claim-evidence-object-lock.ts')
    return refuse(`storage receipt binding mismatch: ${OBJECT_LOCK} package export`);
  const binding = bindingProblem(graph);
  if (binding) return refuse(`storage receipt binding mismatch: ${binding}`);
  const sites = commandSites(graph.sourceFileOf(VERIFIER));
  if (!sites) return refuse('storage receipt command fingerprint mismatch');
  const prerequisite = storageReceiptPrerequisiteProblem(schemaAdmission);
  if (prerequisite) return refuse(`storage receipt ${prerequisite}`);
  const caller = graph
    .sourceFileOf(RECEIPT_CALLER)
    .statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === 'saveApprovedObject'
    );
  return { ...sites, caller: caller.body.statements.at(-1).expression.expression };
}
