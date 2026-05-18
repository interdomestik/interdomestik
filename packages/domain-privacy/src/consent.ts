import type { ConsentDecision, ConsentEvent, ConsentRequirement, PrivacyScope } from './types';

function sameScope(
  consentScope: PrivacyScope | undefined,
  requiredScope: PrivacyScope | undefined
) {
  if (!requiredScope) {
    return true;
  }

  if (!consentScope) {
    return false;
  }

  return (Object.keys(requiredScope) as (keyof PrivacyScope)[]).every(
    key => requiredScope[key] === undefined || consentScope[key] === requiredScope[key]
  );
}

function consentMatchesRequirement(event: ConsentEvent, requirement: ConsentRequirement): boolean {
  return (
    event.tenantId === requirement.tenantId &&
    event.subjectId === requirement.subjectId &&
    event.consentType === requirement.consentType &&
    event.purpose === requirement.purpose &&
    sameScope(event.scope, requirement.scope) &&
    (!requirement.documentSensitivity ||
      event.documentSensitivity === requirement.documentSensitivity) &&
    (!requirement.recipientClass || event.recipientClass === requirement.recipientClass)
  );
}

function consentEventTime(event: ConsentEvent): number {
  const timestamp = Date.parse(event.recordedAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function findLatestConsentEvent(
  events: readonly ConsentEvent[],
  requirement: ConsentRequirement
): ConsentEvent | undefined {
  return events
    .filter(event => consentMatchesRequirement(event, requirement))
    .sort((a, b) => consentEventTime(b) - consentEventTime(a))[0];
}

export function evaluateConsentRequirement(
  events: readonly ConsentEvent[],
  requirement: ConsentRequirement
): ConsentDecision {
  const latest = findLatestConsentEvent(events, requirement);
  const requiresExplicitConsent =
    requirement.consentType === 'medical_document_processing' ||
    requirement.requiredArticle9Basis === 'explicit_consent';

  if (!latest) {
    return {
      kind: 'blocked',
      reasons: ['consent_missing'],
      requiresExplicitConsent,
    };
  }

  if (latest.status !== 'accepted') {
    return {
      kind: 'blocked',
      consentEvent: latest,
      reasons: [`consent_${latest.status}`],
      requiresExplicitConsent,
    };
  }

  if (!Number.isFinite(Date.parse(latest.recordedAt))) {
    return {
      kind: 'blocked',
      consentEvent: latest,
      reasons: ['consent_timestamp_invalid'],
      requiresExplicitConsent,
    };
  }

  if (requirement.requiresArticle9Basis && !latest.article9Basis) {
    return {
      kind: 'blocked',
      consentEvent: latest,
      reasons: ['article_9_basis_missing'],
      requiresExplicitConsent,
    };
  }

  if (
    requirement.requiredArticle9Basis &&
    latest.article9Basis !== requirement.requiredArticle9Basis
  ) {
    return {
      kind: 'blocked',
      consentEvent: latest,
      reasons: ['article_9_basis_mismatch'],
      requiresExplicitConsent,
    };
  }

  return {
    kind: 'allowed',
    consentEvent: latest,
    reasons: [],
    requiresExplicitConsent,
  };
}
