const DECISION_FIELDS = [
  'decision',
  'concreteAnswer',
  'reason',
  'evidenceRef',
  'verifiedAt',
  'riskCategory',
  'severity',
];
const CONTEXTUAL_FIELDS = new Set([
  'contextualNoteState',
  'retainedSidecar',
  'suggestedReview',
  'suggestionVersion',
  'useSessionDateFor',
]);

const allowedDecisionFields = decision =>
  new Set([
    ...DECISION_FIELDS,
    ...(['change', 'block'].includes(decision?.decision) ? ['requestedChange'] : []),
  ]);

export function canonicalDecisions(decisions = {}) {
  return Object.fromEntries(
    Object.entries(decisions).map(([itemId, decision = {}]) => {
      const canonical = Object.fromEntries(
        DECISION_FIELDS.filter(field => decision[field] !== undefined).map(field => [
          field,
          decision[field],
        ])
      );
      const requestedChange = decision.requestedChange?.trim();
      if (['change', 'block'].includes(decision.decision) && requestedChange) {
        canonical.requestedChange = requestedChange;
      }
      return [itemId, canonical];
    })
  );
}

export function hasCanonicalDecisionKeys(decision) {
  const allowed = allowedDecisionFields(decision);
  return Object.keys(decision).every(key => allowed.has(key));
}

export function containsContextualMetadata(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.keys(value).some(
    key => CONTEXTUAL_FIELDS.has(key) || containsContextualMetadata(value[key], seen)
  );
}

export function canonicalStructuredResponses(value) {
  if (Array.isArray(value)) return value.map(canonicalStructuredResponses);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !CONTEXTUAL_FIELDS.has(key))
      .map(([key, nested]) => [key, canonicalStructuredResponses(nested)])
  );
}
