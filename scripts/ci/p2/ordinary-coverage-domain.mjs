// Coverage denominator data only. This finite domain never permits imports or runtime/native evidence.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const localeFiles = [
  'about.json',
  'accidentJourney.json',
  'admin-branches.json',
  'admin-claims.json',
  'admin-commissions.json',
  'admin-common.json',
  'admin-crm.json',
  'admin-dashboard.json',
  'admin-leads.json',
  'admin-settings.json',
  'admin-users.json',
  'admin.json',
  'agent-claims.json',
  'agent-crm.json',
  'agent-members.json',
  'agent-toolkit.json',
  'agent.json',
  'auth.json',
  'claimCategories.json',
  'claims-tracking.json',
  'claims.json',
  'commercialTerms.json',
  'common.json',
  'consumerRights.json',
  'coverageMatrix.json',
  'dashboard.json',
  'diaspora.json',
  'documents.json',
  'entityDisclosure.json',
  'evidence.json',
  'faq.json',
  'features.json',
  'flightJourney.json',
  'footer.json',
  'freeStart.json',
  'freeStartResult.json',
  'freeStartResultEvidence.json',
  'help.json',
  'hero.json',
  'howItWorks.json',
  'howMembershipWorks.json',
  'injuryJourney.json',
  'legal.json',
  'memberBenefits.json',
  'membership-success.json',
  'membership.json',
  'messaging.json',
  'metadata.json',
  'nav.json',
  'notifications.json',
  'nps.json',
  'partners.json',
  'pricing.json',
  'propertyJourney.json',
  'services.json',
  'servicesPage.json',
  'settings.json',
  'staff-crm.json',
  'stats.json',
  'testimonials.json',
  'timeline.json',
  'trust.json',
  'trustStats.json',
  'voiceClaim.json',
  'wizard.json',
];
const supplementalFiles = new Map([
  ...['en', 'mk', 'sq', 'sr'].flatMap(locale =>
    localeFiles.map(file => ['apps/web/src/messages/' + locale + '/' + file, 'locale-json'])
  ),
  ['apps/web/e2e/gate/admin-claims-read-projection.fixture.ts', 'e2e-support-typescript'],
  ['apps/web/e2e/gate/admin-claims-read-result.fixture.ts', 'e2e-support-typescript'],
  ['apps/web/e2e/gate/information-request-read-projection.fixture.ts', 'e2e-support-typescript'],
  ['apps/web/e2e/gate/information-request-read-result.fixture.ts', 'e2e-support-typescript'],
  ['apps/web/public/help-now-packs/content-packs.v1.json', 'public-help-json'],
  ['apps/web/src/features/help-now/copy-en.json', 'help-copy-json'],
  ['apps/web/src/features/help-now/copy-mk.json', 'help-copy-json'],
  ['apps/web/src/features/help-now/copy-sq.json', 'help-copy-json'],
  ['apps/web/src/features/help-now/copy-sr.json', 'help-copy-json'],
]);
const fail = reason => {
  throw Error('P2 ordinary coverage domain refused: ' + reason);
};
export function ordinaryCoverageSourceClass(file) {
  if (typeof file !== 'string') return null;
  return (
    supplementalFiles.get(file) ??
    (/^apps\/web\/src\/.+\.[cm]?[jt]sx?$/u.test(file) ? 'web-source' : null)
  );
}
// Bind added data/support rows to the protected caller's actual candidate M Git tree,
// not merely its source-C policy list. Istanbul/Vite JSON coordinates remain coverage
// geometry; no raw-JSON AST/source-position correspondence is asserted here.
function capturePhysicalBinding(file, candidateRoot, trackedSourceEntries) {
  const expected = Object.hasOwn(trackedSourceEntries ?? {}, file)
    ? trackedSourceEntries[file]
    : null;
  if (
    !expected ||
    JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(['blob', 'mode']) ||
    expected.mode !== '100644' ||
    !/^[a-f0-9]{40}$/u.test(expected.blob)
  )
    fail('candidate Git data binding');
  const full = path.join(candidateRoot, file);
  const stat = fs.lstatSync(full);
  if (
    fs.realpathSync(full) !== full ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o111) !== 0 ||
    stat.size > 128 * 1024
  )
    fail('physical data/support source');
  const bytes = fs.readFileSync(full);
  const blob = createHash('sha1')
    .update('blob ' + bytes.length + '\0')
    .update(bytes)
    .digest('hex');
  if (bytes.length !== stat.size || blob !== expected.blob)
    fail('candidate Git blob/physical bytes');
  return { bytes, blob, expected };
}
export function captureOrdinaryCoverageDataBinding({ file, candidateRoot, trackedSourceEntries }) {
  const kind = supplementalFiles.get(file);
  if (!kind) fail('unknown data/support path');
  const { bytes, blob, expected } = capturePhysicalBinding(
    file,
    candidateRoot,
    trackedSourceEntries
  );
  if (kind !== 'e2e-support-typescript') {
    let value;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('JSON source bytes');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('JSON source object');
  }
  return Object.freeze({
    file,
    kind,
    mode: expected.mode,
    gitBlob: blob,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    coverageDenominatorOnly: true,
    executionAuthority: false,
    nativeCredit: false,
  });
}

// Exact retained M4-C0 reporter-format cases. Signed values are converter residuals,
// not execution counts. Raw values and both slots remain in Istanbul unchanged.
const signedResiduals = [
  {
    file: 'apps/web/src/app/[locale]/(agent)/agent/crm/task-queue-actions.ts',
    blob: '7420c6f62de8ef5bef138a81970a84adfdb83dd6',
    branchId: '54',
    parentId: '107',
    parentCount: 1,
    raw: [2, -1],
    line: 435,
    endLine: 437,
  },
  {
    file: 'apps/web/src/features/claims/components/use-signed-upload-retry.ts',
    blob: '29c981cabb9a5caf0e85738b0a09c20807b218a3',
    branchId: '8',
    parentId: '54',
    parentCount: 26,
    raw: [29, -3],
    line: 196,
    endLine: 209,
  },
];
export function captureOrdinarySignedElseResidual(row, branchId, context = {}) {
  const { candidateRoot, trackedSourceEntries, ordinaryArtifactIdentity: identity } = context;
  const fixed = signedResiduals.find(
    item =>
      row.path === item.file ||
      (typeof candidateRoot === 'string' && row.path === path.join(candidateRoot, item.file))
  );
  if (
    !fixed ||
    branchId !== fixed.branchId ||
    identity?.qualificationPurpose !== 'm4-c0' ||
    identity.artifactId !== 12808761791 ||
    identity.runId !== 40670095708 ||
    identity.attempt !== 1 ||
    identity.digest !== 'sha256:27ff228a45d8499f2a713801979c41fcfa3a8e6cc1912e934feb42a18a82a6cf' ||
    identity.context?.candidateCommit !== 'c627401bdfa2af1a7ad3ef4b97d53f2d931c9fb6' ||
    identity.context?.candidateTree !== 'd6742aa923b8b34600dec70ff89604a493e0deae' ||
    identity.context?.headCommit !== '3a8936e9b99677b6e77443f3fdcc8d28e4deca19'
  )
    fail('artifact-specific signed residual identity');
  const { blob } = capturePhysicalBinding(fixed.file, candidateRoot, trackedSourceEntries);
  if (blob !== fixed.blob) fail('signed residual source blob');
  const branch = row.branchMap[branchId];
  const loc = {
    start: { line: fixed.line, column: 4 },
    end: { line: fixed.endLine, column: null },
  };
  if (
    branch?.type !== 'if' ||
    branch.line !== fixed.line ||
    JSON.stringify(branch.loc) !== JSON.stringify(loc) ||
    JSON.stringify(branch.locations) !== JSON.stringify([loc, { start: {}, end: {} }]) ||
    JSON.stringify(row.b[branchId]) !== JSON.stringify(fixed.raw) ||
    JSON.stringify(row.statementMap[fixed.parentId]) !== JSON.stringify(loc) ||
    row.s[fixed.parentId] !== fixed.parentCount ||
    fixed.parentCount - row.b[branchId][0] !== row.b[branchId][1]
  )
    fail('exact signed residual geometry/arithmetic');
  return Object.freeze({
    file: fixed.file,
    branchId,
    gitBlob: blob,
    raw: Object.freeze([...fixed.raw]),
    parentStatementId: fixed.parentId,
    parentStatementCount: fixed.parentCount,
    converterArithmetic: 'parent-minus-consequent',
    residualIsExecutionCount: false,
    nativeCredit: false,
    hostedCredit: false,
  });
}
