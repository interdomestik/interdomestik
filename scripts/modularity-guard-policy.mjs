export const MODULARITY_POLICY = Object.freeze({
  productionCode: Object.freeze({ preferredLines: 150, reviewLines: 300 }),
  focusedTest: Object.freeze({ maxLines: 300 }),
  structuredArtifact: Object.freeze({ maxBytes: 128 * 1024 }),
  governanceDoc: Object.freeze({ maxLines: 1000, maxBytes: 128 * 1024 }),
  workflowYaml: Object.freeze({}),
});
export const MODULARITY_LINE_LIMIT = MODULARITY_POLICY.productionCode.preferredLines;
const SEMANTIC_GOVERNANCE_PATHS = new Set([
  'AGENTS.md',
  'docs/plans/current-program.md',
  'docs/plans/current-tracker.md',
  'docs/plans/history/2026-09-22-current-program-ledger.md',
  'docs/plans/history/2026-09-22-current-tracker-ledger.md',
]);
export const FILE_CLASSES = Object.freeze({
  productionCode: 'production-code',
  focusedTest: 'focused-test',
  structuredArtifact: 'structured-artifact',
  governanceDoc: 'governance-doc',
  workflowYaml: 'workflow-yaml',
  generatedOrLock: 'generated-or-lock',
  unknown: 'unknown',
});
export const CHECKED_TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.js',
  '.jsx',
  '.json',
  '.jsonl',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const PRODUCTION_EXTENSIONS = new Set('.cjs .css .js .jsx .mjs .sh .ts .tsx'.split(' '));
const STRUCTURED_EXTENSIONS = new Set(['.json', '.jsonl', '.toml', '.yaml', '.yml']);
/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const STRUCTURED_OWNERS = [
  [/^\.github\/actions\/pr-feedback-setup\/action\.yml$/u, 'pr-feedback-refresh-contract'],
  [/^\.github\/actions\/setup\/action\.yml$/u, 'private-node-cache-contract'],
  [/^scripts\/ci\/reviewer-no-tools\.toml$/u, 'reviewer-tool-denial-contract'],
  [/^\.github\/actions\/validation-surface\/action\.yml$/u, 'main-e2e-reuse-workflow-contract'],
  [/^\.github\/reviewer-routing\.json$/u, 'reviewer-routing-contract'],
  [/^docs\/plans\/.*\.json$/u, 'approval-artifact-contract'],
  [
    /^scripts\/release-gate\/v1-required-specs\.json$/u,
    'release-candidate-required-specs-contract',
  ],
  [/(^|\/)package\.json$|^pnpm-workspace\.yaml$/u, 'package-manifest-contract'],
  [/(^|\/)tsconfig(?:\.[^.]+)?\.json$/u, 'typescript-config-contract'],
  [/^scripts\/(?:ci\/)?[^/]+\.json$/u, 'script-config-contract'],
  [/^(?:components|turbo|vercel)\.json$/u, 'repository-config-contract'],
  [/^\.codex\/config\.toml$/u, 'codex-config-contract'],
  [/^\.codex\/agents\/interdomestik-developer\.toml$/u, 'interdomestik-development-agent-contract'],
  [
    /^\.codex\/agents\/interdomestik-slice-director\.toml$/u,
    'interdomestik-three-agent-trial-contract',
  ],
  [
    /^\.codex\/agents\/interdomestik-workflow-coach\.toml$/u,
    'interdomestik-three-agent-trial-contract',
  ],
  [
    /^apps\/web\/src\/features\/help-now\/copy-(?:en|sq|mk|sr|de)\.json$/u,
    's7-helpnow-localized-copy-contract',
  ],
  [/^apps\/web\/public\/manifest\.json$/u, 'pwa-manifest-contract'],
];
// A constant keeps owner/path pairs such as auth.json clear of secret-scanner key heuristics.
const PARITY_OWNER = 'i18n-keys-parity-contract';
const LOCALE_CATALOG_OWNERS = new Map([
  ['admin-users.json', 's7-admin-user-read-recovery-i18n-contract'],
  ['admin-claims.json', 's7-admin-claims-read-consistency-i18n-contract'],
  ['freeStart.json', 's5-local-draft-disclosure-i18n-contract'],
  ['diaspora.json', 's5d-diaspora-claim-start-i18n-contract'],
  ['dashboard.json', 't117b-member-portal-i18n-contract'],
  ['claims.json', 'member-evidence-upload-locale-contract'],
  ['messaging.json', 'member-case-communication-i18n-contract'],
  ['agent-claims.json', 's4-missing-information-request-i18n-contract'],
  ['claims-tracking.json', 't210-member-timeline-i18n-contract'],
  ['notifications.json', 't410-notification-acknowledgement-i18n-contract'],
  ['membership.json', 's6-member-payment-recovery-i18n-contract'],
  ['admin-leads.json', 'cash-approval-fulfillment-i18n-contract'],
  ['agent.json', 'acq-1-lead-notice-i18n-contract'],
  ['pricing.json', 'acq-1-lead-notice-i18n-contract'],
  ['admin-branches.json', 'locale-catalog-integrity-contract'],
  ['agent-members.json', 'acq-3b-sponsor-i18n-contract'],
  ['nav.json', 'acq-3b-sponsor-i18n-contract'],
  ['sponsors.json', 'acq-3b-sponsor-i18n-contract'],
  ['sponsorOptOut.json', 'acq-3b-sponsor-i18n-contract'],
  ['sponsorTasks.json', 'acq-3b-sponsor-i18n-contract'],
  // German catalogs without a per-file feature owner, registered by exact locale-scoped name.
  ['de/about.json', 'de-locale-catalog-contract'],
  ['de/accidentJourney.json', 'de-locale-catalog-contract'],
  ['de/admin-commissions.json', 'de-locale-catalog-contract'],
  ['de/admin-common.json', 'de-locale-catalog-contract'],
  ['de/admin-crm.json', 'de-locale-catalog-contract'],
  ['de/admin-dashboard.json', 'de-locale-catalog-contract'],
  ['de/admin-settings.json', 'de-locale-catalog-contract'],
  ['de/admin.json', 'de-locale-catalog-contract'],
  ['de/agent-crm.json', 'locale-quality-pass-i18n-contract'],
  ['de/agent-toolkit.json', 'de-locale-catalog-contract'],
  ['de/auth.json', PARITY_OWNER],
  ['de/claimCategories.json', 'locale-quality-pass-i18n-contract'],
  ['de/commercialTerms.json', 'de-locale-catalog-contract'],
  ['de/common.json', 'locale-quality-pass-i18n-contract'],
  ['de/consumerRights.json', 'locale-quality-pass-i18n-contract'],
  ['de/coverageMatrix.json', 'de-locale-catalog-contract'],
  ['de/documents.json', 'de-locale-catalog-contract'],
  ['de/entityDisclosure.json', 'de-locale-catalog-contract'],
  ['de/evidence.json', 'de-locale-catalog-contract'],
  ['de/faq.json', 'de-locale-catalog-contract'],
  ['de/features.json', 'de-locale-catalog-contract'],
  ['de/flightJourney.json', 'locale-quality-pass-i18n-contract'],
  ['de/footer.json', 'de-locale-catalog-contract'],
  ['de/freeStartResult.json', 'de-locale-catalog-contract'],
  ['de/freeStartResultEvidence.json', 'locale-quality-pass-i18n-contract'],
  ['de/help.json', 'de-locale-catalog-contract'],
  ['de/hero.json', 'locale-quality-pass-i18n-contract'],
  ['de/howItWorks.json', 'de-locale-catalog-contract'],
  ['de/howMembershipWorks.json', 'de-locale-catalog-contract'],
  ['de/injuryJourney.json', 'de-locale-catalog-contract'],
  ['de/legal.json', 'de-locale-catalog-contract'],
  ['de/memberBenefits.json', 'de-locale-catalog-contract'],
  ['de/membership-success.json', 'de-locale-catalog-contract'],
  ['de/metadata.json', 'de-locale-catalog-contract'],
  ['de/nps.json', 'de-locale-catalog-contract'],
  ['de/partners.json', 'de-locale-catalog-contract'],
  ['de/propertyJourney.json', 'locale-quality-pass-i18n-contract'],
  ['de/services.json', 'locale-quality-pass-i18n-contract'],
  ['de/servicesPage.json', 'de-locale-catalog-contract'],
  ['de/settings.json', 'de-locale-catalog-contract'],
  ['de/staff-crm.json', 'de-locale-catalog-contract'],
  ['de/stats.json', 'de-locale-catalog-contract'],
  ['de/testimonials.json', 'de-locale-catalog-contract'],
  ['de/timeline.json', 'de-locale-catalog-contract'],
  ['de/trust.json', 'de-locale-catalog-contract'],
  ['de/trustStats.json', 'de-locale-catalog-contract'],
  ['de/voiceClaim.json', 'de-locale-catalog-contract'],
  ['de/wizard.json', 'de-locale-catalog-contract'],
  ['en/auth.json', PARITY_OWNER],
  ['mk/auth.json', PARITY_OWNER],
  ['sr/auth.json', PARITY_OWNER],
  ['mk/services.json', PARITY_OWNER],
  ['sr/services.json', PARITY_OWNER],
  ['mk/trust.json', PARITY_OWNER],
  ['sr/trust.json', PARITY_OWNER],
  // Non-German catalogs corrected by the locale quality pass (terminology, script, register).
  ['en/agent-crm.json', 'locale-quality-pass-i18n-contract'],
  ['en/claimCategories.json', 'locale-quality-pass-i18n-contract'],
  ['en/common.json', 'locale-quality-pass-i18n-contract'],
  ['en/consumerRights.json', 'locale-quality-pass-i18n-contract'],
  ['en/flightJourney.json', 'locale-quality-pass-i18n-contract'],
  ['en/freeStartResultEvidence.json', 'locale-quality-pass-i18n-contract'],
  ['en/hero.json', 'locale-quality-pass-i18n-contract'],
  ['en/propertyJourney.json', 'locale-quality-pass-i18n-contract'],
  ['en/services.json', 'locale-quality-pass-i18n-contract'],
  ['mk/admin-common.json', 'locale-quality-pass-i18n-contract'],
  ['mk/admin-crm.json', 'locale-quality-pass-i18n-contract'],
  ['mk/claimCategories.json', 'locale-quality-pass-i18n-contract'],
  ['mk/common.json', 'locale-quality-pass-i18n-contract'],
  ['mk/consumerRights.json', 'locale-quality-pass-i18n-contract'],
  ['mk/evidence.json', 'locale-quality-pass-i18n-contract'],
  ['mk/hero.json', 'locale-quality-pass-i18n-contract'],
  ['mk/legal.json', 'locale-quality-pass-i18n-contract'],
  ['mk/staff-crm.json', 'locale-quality-pass-i18n-contract'],
  ['sq/admin-common.json', 'locale-quality-pass-i18n-contract'],
  ['sq/admin-crm.json', 'locale-quality-pass-i18n-contract'],
  ['sq/admin-dashboard.json', 'locale-quality-pass-i18n-contract'],
  ['sq/agent-crm.json', 'locale-quality-pass-i18n-contract'],
  ['sq/auth.json', 'locale-quality-pass-i18n-contract'],
  ['sq/claimCategories.json', 'locale-quality-pass-i18n-contract'],
  ['sq/common.json', 'locale-quality-pass-i18n-contract'],
  ['sq/consumerRights.json', 'locale-quality-pass-i18n-contract'],
  ['sq/evidence.json', 'locale-quality-pass-i18n-contract'],
  ['sq/hero.json', 'locale-quality-pass-i18n-contract'],
  ['sq/legal.json', 'locale-quality-pass-i18n-contract'],
  ['sq/nps.json', 'locale-quality-pass-i18n-contract'],
  ['sq/staff-crm.json', 'locale-quality-pass-i18n-contract'],
  ['sq/wizard.json', 'locale-quality-pass-i18n-contract'],
  ['sr/admin-common.json', 'locale-quality-pass-i18n-contract'],
  ['sr/admin-crm.json', 'locale-quality-pass-i18n-contract'],
  ['sr/claimCategories.json', 'locale-quality-pass-i18n-contract'],
  ['sr/common.json', 'locale-quality-pass-i18n-contract'],
  ['sr/consumerRights.json', 'locale-quality-pass-i18n-contract'],
  ['sr/evidence.json', 'locale-quality-pass-i18n-contract'],
  ['sr/hero.json', 'locale-quality-pass-i18n-contract'],
  ['sr/legal.json', 'locale-quality-pass-i18n-contract'],
  ['sr/settings.json', 'locale-quality-pass-i18n-contract'],
  ['sr/staff-crm.json', 'locale-quality-pass-i18n-contract'],
]);
/** Registry keys: a bare filename applies to every locale; `<locale>/<file>` to that locale only. */
export const LOCALE_CATALOG_OWNER_KEYS = Object.freeze([...LOCALE_CATALOG_OWNERS.keys()]);
const GENERATED_EXACT_FILES = new Set([
  'bun.lockb',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const GENERATED_PREFIXES = [
  '.next/',
  'apps/web/.next/',
  'apps/web/playwright-report/',
  'apps/web/test-results/',
  'build/',
  'coverage/',
  'dist/',
  'node_modules/',
  'packages/database/drizzle/',
];
const GENERATED_SEGMENTS = new Set(['.next', 'build', 'coverage', 'dist', 'node_modules']);
const extension = filePath => {
  const name = filePath.split('/').at(-1);
  return name.includes('.') ? `.${name.split('.').at(-1)}` : '';
};
export function toPolicyPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}
export function isSemanticGovernanceDocument(filePath) {
  return SEMANTIC_GOVERNANCE_PATHS.has(toPolicyPath(filePath));
}
export function isCheckedTextFile(filePath) {
  return CHECKED_TEXT_EXTENSIONS.has(extension(toPolicyPath(filePath)));
}
export function isExplicitModularityException(filePath) {
  return classifyModularityFile(filePath) === FILE_CLASSES.generatedOrLock;
}
export function structuredArtifactOwner(filePath) {
  const relPath = toPolicyPath(filePath);
  const match = /^apps\/web\/src\/messages\/((de|en|mk|sq|sr)\/([^/]+\.json))$/u.exec(relPath);
  const localeOwner = match
    ? (LOCALE_CATALOG_OWNERS.get(match[3]) ?? LOCALE_CATALOG_OWNERS.get(match[1]))
    : undefined;
  if (localeOwner) return localeOwner;
  return STRUCTURED_OWNERS.find(([pattern]) => pattern.test(relPath))?.[1] ?? null;
}
export function classifyModularityFile(filePath) {
  const relPath = toPolicyPath(filePath);
  if (GENERATED_EXACT_FILES.has(relPath) || relPath.endsWith('.d.ts')) {
    return FILE_CLASSES.generatedOrLock;
  }
  if (GENERATED_PREFIXES.some(prefix => relPath.startsWith(prefix))) {
    return FILE_CLASSES.generatedOrLock;
  }
  if (relPath.startsWith('apps/web/public/icon-')) return FILE_CLASSES.generatedOrLock;
  if (relPath.split('/').some(segment => GENERATED_SEGMENTS.has(segment))) {
    return FILE_CLASSES.generatedOrLock;
  }
  if (!isCheckedTextFile(relPath)) return null;
  const ext = extension(relPath);
  if (relPath.startsWith('.github/workflows/') && ['.yaml', '.yml'].includes(ext)) {
    return FILE_CLASSES.workflowYaml;
  }
  if (/(^|\/)(?:__tests__|tests?)\//u.test(relPath) || /\.(?:spec|test)\.[^.]+$/u.test(relPath)) {
    return FILE_CLASSES.focusedTest;
  }
  if (ext === '.md') return FILE_CLASSES.governanceDoc;
  if (STRUCTURED_EXTENSIONS.has(ext)) return FILE_CLASSES.structuredArtifact;
  if (PRODUCTION_EXTENSIONS.has(ext)) return FILE_CLASSES.productionCode;
  return FILE_CLASSES.unknown;
}
export function isModularityChecked(filePath) {
  return classifyModularityFile(filePath) !== null;
}
