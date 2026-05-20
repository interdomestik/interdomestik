import type {
  AssistanceDisclaimerCode,
  AssistanceEvidenceReference,
  AssistanceOutcome,
  AssistanceOutcomeKind,
  AssistancePackSummary,
  AssistancePackType,
  AssistanceReason,
  AssistanceSessionDigest,
  AssistanceWorkflowBlockerCode,
  AssistanceWorkflowIntent,
  AssistanceWorkflowIntentKind,
  AssistanceWorkflowPackReference,
  AssistanceWorkflowRedactionPosture,
  AssistanceWorkflowTargetSurface,
  PiiClassification,
} from '../types';

const TARGET_ORDER = [
  'member_zone',
  'claim_context',
  'support_handoff',
  'crm_follow_up',
  'professional_recovery_review',
  'blocked_workflow',
] as const satisfies readonly AssistanceWorkflowTargetSurface[];

const MEMBER_REQUIRED_TARGETS = new Set<AssistanceWorkflowTargetSurface>([
  'member_zone',
  'claim_context',
  'support_handoff',
  'crm_follow_up',
  'professional_recovery_review',
]);

const COUNTRY_DEPENDENT_PACK_TYPES = new Set<AssistancePackType>([
  'legal_basis',
  'procedure',
  'injury_category',
  'vehicle_damage',
  'invalidity_review',
  'recovery_eligibility',
]);

const SENSITIVE_PII_CLASSIFICATIONS = new Set<PiiClassification>([
  'medical_sensitive',
  'legal_financial_sensitive',
  'professional_secret',
]);

const BLOCKED_OUTCOME_KINDS = new Set<AssistanceOutcomeKind>([
  'manual_review_required',
  'uncertain',
  'unsupported_country',
  'out_of_scope',
  'requires_member_zone',
  'requires_professional_recovery',
]);

const sortTextAscending = (left: string, right: string): number => left.localeCompare(right);

type IntentCandidate = {
  intentKind: AssistanceWorkflowIntentKind;
  targetSurface: AssistanceWorkflowTargetSurface;
  reasonCodes: readonly string[];
  packTypes?: readonly AssistancePackType[];
};

export function createAssistanceWorkflowIntents(
  digest: AssistanceSessionDigest
): readonly AssistanceWorkflowIntent[] {
  const digestAny = digest as AssistanceSessionDigest & {
    createdRecordIds?: unknown;
    externalRecordIds?: unknown;
  };
  const reconciliation = reconcileDigestPairs(digest.packSummaries, digest.outcomes);
  const requiredDisclaimers = collectRequiredDisclaimers(digest.outcomes);
  const missingDisclaimers = requiredDisclaimers.filter(
    disclaimer => !digest.disclaimersShown.includes(disclaimer)
  );
  const globalBlockers = collectGlobalBlockers({
    digest,
    digestHasCreatedRecords:
      digestAny.createdRecordIds !== undefined || digestAny.externalRecordIds !== undefined,
    missingDisclaimers,
    reconciliationBlocked: reconciliation.blocked,
  });
  const candidates = createIntentCandidates(digest);
  const effectiveCandidates = selectEffectiveCandidates(candidates, globalBlockers);

  return effectiveCandidates
    .map(candidate => {
      const targetBlockers = collectTargetBlockers(digest, candidate.targetSurface);
      const blockers = dedupe([...globalBlockers, ...targetBlockers]);
      const packReferences = selectPackReferences(digest.packSummaries, candidate.packTypes);
      const evidence = sanitizeEvidenceReferences(
        collectEvidence(digest.outcomes, digest.packSummaries, packReferences)
      );
      const reasons = createReasons(candidate.reasonCodes, blockers, digest);

      return {
        intentKind: blockers.length > 0 ? 'blocked_workflow_intent' : candidate.intentKind,
        targetSurface: candidate.targetSurface,
        executionAllowed: false,
        blocked: blockers.length > 0,
        outcomeKind: selectOutcomeKind(digest.outcomes, packReferences),
        reasons,
        blockers,
        evidence,
        packReferences,
        ...(requiresExplicitConsent(candidate.targetSurface)
          ? { requiredConsentState: 'explicit_consent_recorded' as const }
          : {}),
        requiredDisclaimers,
        missingDisclaimers,
        requiredHumanReview:
          digest.requiredHumanReview ||
          digest.outcomes.some(outcome => outcome.humanReviewRequired) ||
          digest.packSummaries.some(summary => summary.requiredHumanReview) ||
          blockers.includes('sensitive_human_review_missing') ||
          blockers.includes('ai_non_final_review_required') ||
          blockers.includes('professional_recovery_activation_blocked'),
        piiClassification: digest.piiClassification,
        redactionPosture: redactionPostureFor(digest.piiClassification),
        aiAdvisoryOnly: digest.aiProvenance.length > 0,
        referenceKey: createReferenceKey({
          digest,
          candidate,
          blockers,
          packReferences,
          missingDisclaimers,
        }),
      } satisfies AssistanceWorkflowIntent;
    })
    .sort(
      (left, right) =>
        TARGET_ORDER.indexOf(left.targetSurface) - TARGET_ORDER.indexOf(right.targetSurface)
    );
}

function selectEffectiveCandidates(
  candidates: readonly IntentCandidate[],
  globalBlockers: readonly AssistanceWorkflowBlockerCode[]
): readonly IntentCandidate[] {
  if (candidates.length > 0) {
    return candidates;
  }

  if (globalBlockers.length === 0) {
    return [];
  }

  return [
    {
      intentKind: 'blocked_workflow_intent',
      targetSurface: 'blocked_workflow',
      reasonCodes: ['workflow.blocked.fail_closed'],
    },
  ];
}

function createIntentCandidates(digest: AssistanceSessionDigest): readonly IntentCandidate[] {
  const candidates: IntentCandidate[] = [];
  const addCandidate = (candidate: IntentCandidate): void => {
    if (!candidates.some(existing => existing.targetSurface === candidate.targetSurface)) {
      candidates.push(candidate);
    }
  };

  if (
    digest.escalationRecommendation === 'member_zone' ||
    digest.outcomes.some(outcome => outcome.kind === 'requires_member_zone')
  ) {
    addCandidate({
      intentKind: 'prepare_member_zone_context',
      targetSurface: 'member_zone',
      reasonCodes: ['workflow.member_zone.requested'],
      packTypes: ['incident_scene'],
    });
  }

  const claimContextPackTypes = digest.packSummaries
    .filter(summary => summary.zone === 'member' && summary.packType !== 'recovery_eligibility')
    .map(summary => summary.packType);

  if (claimContextPackTypes.length > 0) {
    addCandidate({
      intentKind: 'prepare_claim_context_review',
      targetSurface: 'claim_context',
      reasonCodes: ['workflow.claim_context.review_requested'],
      packTypes: claimContextPackTypes,
    });
  }

  if (digest.escalationRecommendation === 'staff_handoff') {
    addCandidate({
      intentKind: 'prepare_support_handoff_review',
      targetSurface: 'support_handoff',
      reasonCodes: ['workflow.support_handoff.requested'],
    });
  }

  if (digest.escalationRecommendation === 'emergency_services') {
    addCandidate({
      intentKind: 'prepare_support_handoff_review',
      targetSurface: 'support_handoff',
      reasonCodes: ['workflow.emergency_services.blocked'],
    });
  }

  if (digest.escalationRecommendation === 'professional_recovery') {
    addCandidate({
      intentKind: 'prepare_crm_follow_up_review',
      targetSurface: 'crm_follow_up',
      reasonCodes: ['workflow.crm_follow_up.review_requested'],
      packTypes: ['incident_scene'],
    });
  }

  if (
    digest.escalationRecommendation === 'professional_recovery' ||
    digest.outcomes.some(outcome => outcome.kind === 'requires_professional_recovery')
  ) {
    addCandidate({
      intentKind: 'prepare_professional_recovery_review',
      targetSurface: 'professional_recovery_review',
      reasonCodes: ['workflow.professional_recovery.review_requested'],
    });
  }

  return candidates;
}

function collectGlobalBlockers(params: {
  digest: AssistanceSessionDigest;
  digestHasCreatedRecords: boolean;
  missingDisclaimers: readonly AssistanceDisclaimerCode[];
  reconciliationBlocked: boolean;
}): readonly AssistanceWorkflowBlockerCode[] {
  const blockers: AssistanceWorkflowBlockerCode[] = [];
  const { digest } = params;

  if (digest.sessionId.trim() === '') {
    blockers.push('session_identity_missing');
  }

  if (params.missingDisclaimers.length > 0 || digest.disclaimersShown.length === 0) {
    blockers.push('required_disclaimer_missing');
  }

  if (params.reconciliationBlocked) {
    blockers.push('digest_summary_outcome_mismatch');
  }

  if (digest.packSummaries.length !== digest.outcomes.length) {
    blockers.push('digest_pair_count_mismatch');
  }

  if (countryMetadataMissing(digest)) {
    blockers.push('country_rule_metadata_missing');
  }

  if (SENSITIVE_PII_CLASSIFICATIONS.has(digest.piiClassification) && !digest.requiredHumanReview) {
    blockers.push('sensitive_human_review_missing');
  }

  if (digest.aiProvenance.length > 0) {
    blockers.push('ai_non_final_review_required');
  }

  if (digest.outcomes.some(outcome => BLOCKED_OUTCOME_KINDS.has(outcome.kind))) {
    blockers.push('final_or_executable_outcome_blocked');
  }

  if (params.digestHasCreatedRecords) {
    blockers.push('created_or_external_record_ids_present');
  }

  if (digest.escalationRecommendation === 'professional_recovery') {
    blockers.push('professional_recovery_activation_blocked');
  }

  return dedupe(blockers);
}

function collectTargetBlockers(
  digest: AssistanceSessionDigest,
  targetSurface: AssistanceWorkflowTargetSurface
): readonly AssistanceWorkflowBlockerCode[] {
  const blockers: AssistanceWorkflowBlockerCode[] = [];

  if (MEMBER_REQUIRED_TARGETS.has(targetSurface) && digest.memberId === undefined) {
    blockers.push('member_attachment_missing');
  }

  if (
    requiresExplicitConsent(targetSurface) &&
    digest.consentState !== 'explicit_consent_recorded'
  ) {
    blockers.push('explicit_consent_missing');
  }

  if (targetSurface === 'professional_recovery_review') {
    blockers.push('professional_recovery_activation_blocked');
  }

  return dedupe(blockers);
}

function reconcileDigestPairs(
  packSummaries: readonly AssistancePackSummary[],
  outcomes: readonly AssistanceOutcome[]
): { blocked: boolean } {
  if (packSummaries.length !== outcomes.length) {
    return { blocked: true };
  }

  return {
    blocked: packSummaries.some((summary, index) => {
      const outcome = outcomes[index];

      return (
        outcome === undefined ||
        summary.outcomeKind !== outcome.kind ||
        summary.zone !== outcome.zone ||
        summary.requiredHumanReview !== outcome.humanReviewRequired
      );
    }),
  };
}

function countryMetadataMissing(digest: AssistanceSessionDigest): boolean {
  return digest.packSummaries.some((summary, index) => {
    if (!COUNTRY_DEPENDENT_PACK_TYPES.has(summary.packType)) {
      return false;
    }

    const outcome = digest.outcomes[index];

    const outcomeCountryMetadataCount = outcome?.countryRuleMetadata.length ?? 0;

    return (
      digest.country === undefined ||
      digest.countryRuleMetadata.length === 0 ||
      outcomeCountryMetadataCount === 0
    );
  });
}

function collectRequiredDisclaimers(
  outcomes: readonly AssistanceOutcome[]
): readonly AssistanceDisclaimerCode[] {
  return dedupe(outcomes.flatMap(outcome => outcome.disclaimers));
}

function selectPackReferences(
  packSummaries: readonly AssistancePackSummary[],
  packTypes?: readonly AssistancePackType[]
): readonly AssistanceWorkflowPackReference[] {
  const selected = packTypes
    ? packSummaries.filter(summary => packTypes.includes(summary.packType))
    : packSummaries;

  return selected.map(summary => ({
    packId: summary.packId,
    packType: summary.packType,
    outcomeKind: summary.outcomeKind,
    zone: summary.zone,
    requiredHumanReview: summary.requiredHumanReview,
  }));
}

function collectEvidence(
  outcomes: readonly AssistanceOutcome[],
  packSummaries: readonly AssistancePackSummary[],
  packReferences: readonly AssistanceWorkflowPackReference[]
): readonly AssistanceEvidenceReference[] {
  const selectedPackIds = new Set(packReferences.map(reference => reference.packId));
  const evidence = outcomes
    .filter((_outcome, index) => {
      const summary = packSummaries[index];

      return summary !== undefined && selectedPackIds.has(summary.packId);
    })
    .flatMap(outcome => outcome.evidence);

  return dedupeBy(evidence, evidenceReferenceKey);
}

function sanitizeEvidenceReferences(
  evidenceReferences: readonly AssistanceEvidenceReference[]
): readonly AssistanceEvidenceReference[] {
  return evidenceReferences.map(evidence => {
    const material = stableStringify({
      kind: evidence.kind,
      referenceId: evidence.referenceId,
      summaryKey: evidence.summaryKey ?? null,
      sourceReference: evidence.sourceReference ?? null,
    });

    const sanitized: AssistanceEvidenceReference = {
      kind: evidence.kind,
      referenceId: `evidence:${evidence.kind}:${hashString(material)}`,
    };

    if (typeof evidence.summaryKey === 'string') {
      sanitized.summaryKey = `summary:${hashString(evidence.summaryKey)}`;
    }

    if (typeof evidence.sourceReference === 'string') {
      sanitized.sourceReference = `source:${hashString(evidence.sourceReference)}`;
    }

    if (typeof evidence.lastReviewed === 'string') {
      sanitized.lastReviewed = evidence.lastReviewed;
    }

    if (typeof evidence.confidence === 'number') {
      sanitized.confidence = evidence.confidence;
    }

    return sanitized;
  });
}

function selectOutcomeKind(
  outcomes: readonly AssistanceOutcome[],
  packReferences: readonly AssistanceWorkflowPackReference[]
): AssistanceOutcomeKind | undefined {
  const byPackOutcomeKind = packReferences[0]?.outcomeKind;

  if (byPackOutcomeKind !== undefined) {
    return byPackOutcomeKind;
  }

  return outcomes[0]?.kind;
}

function createReasons(
  reasonCodes: readonly string[],
  blockers: readonly AssistanceWorkflowBlockerCode[],
  digest: AssistanceSessionDigest
): readonly AssistanceReason[] {
  return dedupe([
    ...reasonCodes,
    ...blockers.map(blocker => `workflow.blocked.${blocker}`),
    ...digest.outcomes.flatMap(outcome => [
      `workflow.source_outcome.${outcome.kind}`,
      ...(outcome.humanReviewRequired ? ['workflow.human_review.required'] : []),
    ]),
    ...(digest.aiProvenance.length > 0 ? ['workflow.ai.advisory_only'] : []),
  ]).map(code => ({ code: sanitizeCode(code) }));
}

function createReferenceKey(params: {
  digest: AssistanceSessionDigest;
  candidate: IntentCandidate;
  blockers: readonly AssistanceWorkflowBlockerCode[];
  packReferences: readonly AssistanceWorkflowPackReference[];
  missingDisclaimers: readonly AssistanceDisclaimerCode[];
}): string {
  const material = stableStringify({
    sessionId: params.digest.sessionId,
    zone: params.digest.zone,
    memberId: params.digest.memberId ?? null,
    country: params.digest.country ?? null,
    consentState: params.digest.consentState,
    escalationRecommendation: params.digest.escalationRecommendation,
    intentKind: params.candidate.intentKind,
    targetSurface: params.candidate.targetSurface,
    packReferences: params.packReferences,
    outcomes: params.digest.outcomes.map(outcome => ({
      kind: outcome.kind,
      zone: outcome.zone,
      reasonFingerprints: outcome.reasons
        .map(reason => hashString(sanitizeCode(reason.code)))
        .sort(sortTextAscending),
      evidence: outcome.evidence.map(evidence => ({
        kind: evidence.kind,
        referenceIdFingerprint: hashString(evidence.referenceId),
        summaryKeyFingerprint:
          evidence.summaryKey === undefined ? null : hashString(evidence.summaryKey),
        sourceReferenceFingerprint:
          evidence.sourceReference === undefined ? null : hashString(evidence.sourceReference),
      })),
      countryRuleMetadata: outcome.countryRuleMetadata.map(metadata => ({
        country: metadata.country,
        sourceReference: metadata.sourceReference,
        lastReviewed: metadata.lastReviewed,
        confidence: metadata.confidence,
      })),
      humanReviewRequired: outcome.humanReviewRequired,
      disclaimers: [...outcome.disclaimers].sort(sortTextAscending),
      provenanceSource: outcome.provenance.source,
      piiClassification: outcome.piiClassification,
    })),
    blockers: [...params.blockers].sort(sortTextAscending),
    missingDisclaimers: [...params.missingDisclaimers].sort(sortTextAscending),
    piiClassification: params.digest.piiClassification,
    ai: params.digest.aiProvenance.map(ai => ({
      role: ai.role,
      workflow: ai.aiWorkflowName,
      schema: ai.aiPromptOrSchemaVersion,
      model: ai.aiModelVersion,
      confidence: ai.aiConfidence,
    })),
  });

  return `assist-wfi:${params.candidate.targetSurface}:${hashString(material)}`;
}

function requiresExplicitConsent(targetSurface: AssistanceWorkflowTargetSurface): boolean {
  return MEMBER_REQUIRED_TARGETS.has(targetSurface);
}

function redactionPostureFor(
  piiClassification: PiiClassification
): AssistanceWorkflowRedactionPosture {
  if (piiClassification === 'none') {
    return 'none';
  }

  if (piiClassification === 'identifier_minimal') {
    return 'identifier_hash_only';
  }

  if (piiClassification === 'professional_secret') {
    return 'professional_secret_reference_only';
  }

  return 'sensitive_reference_only';
}

function sanitizeCode(code: string): string {
  const normalized = code
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_.:-]/g, '_');

  return normalized === '' ? 'workflow.unknown' : normalized;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.entries(value)
    .sort(([left], [right]) => sortTextAscending(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(7, '0');
}

function evidenceReferenceKey(evidence: AssistanceEvidenceReference): string {
  return [
    evidence.kind,
    evidence.referenceId,
    evidence.summaryKey ?? '',
    evidence.sourceReference ?? '',
  ].join(':');
}

function dedupe<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function dedupeBy<T>(values: readonly T[], getKey: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const value of values) {
    const key = getKey(value);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }

  return result;
}
