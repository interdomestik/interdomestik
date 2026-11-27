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
const RECEIPT_UNIT = '528f565df255f9a48b8b59608f31d0808f618ecd88ab8a9fd6949dd4934926a3';
const IMAGES = new Map([
  [VERIFIER, '850e5eb0482f4eb019b8aa418d1c3e00dc1c7bee358bd614b0740b1995065a43'],
  [RECEIPT_CALLER, 'fe3c6b8ed3ec2477bde0e1070fbdace212410eb86be0fc01ce61042d7144f931'],
  [RECEIPT_REEXPORT, '5373364cf020452a3be025098197ec09c840c3d1691865fb97b4b7a2965ffaf2'],
  [BINDER, '0407bc3343f3ac44f0a6fbfe4ec0377ae70bc20d3e17a84243630113411a24c3'],
]);

const BINDINGS = [
  [VERIFIER, './db', 'dbAdmin', `${DB}/db.ts`],
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

const CONTROL_SHAPES = [
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral],
  [ts.SyntaxKind.NoSubstitutionTemplateLiteral],
  [ts.SyntaxKind.TemplateHead],
  [ts.SyntaxKind.TemplateHead],
  [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateMiddle],
];

function isNamedIdentifier(node, name) {
  return ts.isIdentifier(node) && node.text === name;
}

function isDirectCall(node, receiver, name) {
  if (!node || !ts.isCallExpression(node) || node.questionDotToken || node.arguments.length !== 1)
    return false;
  const member = node.expression;
  return (
    ts.isPropertyAccessExpression(member) &&
    !member.questionDotToken &&
    isNamedIdentifier(member.expression, receiver) &&
    member.name.text === name
  );
}

function controlNodes(statement, connectionControl) {
  if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression))
    return [];
  const call = statement.expression.expression;
  if (!isDirectCall(call, 'tx', 'execute')) return [];
  const [tagged] = call.arguments;
  if (!ts.isTaggedTemplateExpression(tagged) || !isNamedIdentifier(tagged.tag, 'sql')) return [];
  const { template } = tagged;
  const literals = ts.isTemplateExpression(template)
    ? [template.head, ...template.templateSpans.map(span => span.literal)]
    : [template];
  return literals.filter(node => connectionControl.test(node.text));
}

function commandSites(source, connectionControl) {
  const unit = source.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === COMMAND
  );
  if (!unit || sha256(fingerprint(unit, source)) !== RECEIPT_UNIT) return null;
  if (!(connectionControl instanceof RegExp)) return null;

  const last = unit.body?.statements.at(-1);
  if (!last || !ts.isReturnStatement(last)) return null;
  const transaction = last.expression;
  if (!isDirectCall(transaction, 'dbAdmin', 'transaction')) return null;
  const [callback] = transaction.arguments;
  if (
    !ts.isArrowFunction(callback) ||
    !callback.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    callback.parameters.length !== 1 ||
    !isNamedIdentifier(callback.parameters[0].name, 'tx') ||
    !ts.isBlock(callback.body)
  )
    return null;

  // The pinned command contains exactly seven connection-control fragments in its first
  // five direct awaited statements. The receipt query receives no node identities.
  const statements = callback.body.statements.slice(0, CONTROL_SHAPES.length);
  if (statements.length !== CONTROL_SHAPES.length) return null;
  const groups = statements.map(statement => controlNodes(statement, connectionControl));
  if (
    groups.some((nodes, index) => {
      const expected = CONTROL_SHAPES[index];
      return (
        nodes.length !== expected.length || nodes.some((node, at) => node.kind !== expected[at])
      );
    })
  )
    return null;
  return { admin: transaction.expression.expression, controls: new Set(groups.flat()) };
}

export function storageReceiptAdmission(ctx, candidate, connectionControl) {
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
  const sites = commandSites(graph.sourceFileOf(VERIFIER), connectionControl);
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
