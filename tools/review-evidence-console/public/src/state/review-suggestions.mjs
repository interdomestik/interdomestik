const VERSION = 1;
const SUGGESTED_FIELDS = [
  'concreteAnswer',
  'reason',
  'evidenceRef',
  'riskCategory',
  'severity',
];

const emptyDecision = () => ({
  decision: null,
  concreteAnswer: '',
  reason: '',
  evidenceRef: '',
  verifiedAt: '',
  riskCategory: '',
  severity: '',
  requestedChange: '',
  responses: {},
});

const clone = value => (value === undefined ? undefined : structuredClone(value));

function validCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function sourceDecisions(draft) {
  return draft?.itemDecisions ?? draft?.decisions ?? {};
}

function withoutSuggestions(bundle, draft) {
  const source = sourceDecisions(draft);
  return Object.fromEntries(
    bundle.packet.itemIds.map(itemId => [
      itemId,
      Object.hasOwn(source, itemId) ? clone(source[itemId]) : emptyDecision(),
    ])
  );
}

function applySuggestion(record, suggestion, sessionDate, fillAbsentOnly) {
  const next = clone(record ?? {});
  const assign = (target, key, value) => {
    if (!fillAbsentOnly || !Object.hasOwn(target, key)) target[key] = clone(value);
  };
  for (const field of SUGGESTED_FIELDS) assign(next, field, suggestion[field]);
  const responses =
    next.responses && typeof next.responses === 'object' && !Array.isArray(next.responses)
      ? clone(next.responses)
      : {};
  for (const [key, value] of Object.entries(suggestion.responses)) {
    assign(responses, key, value);
  }
  for (const key of suggestion.useSessionDateFor) {
    if (key === 'verifiedAt') assign(next, key, sessionDate);
    else assign(responses, key, sessionDate);
  }
  next.responses = responses;
  return next;
}

export function initializeSuggestedDecisions(
  bundle,
  draft,
  { applySuggestions = true, getLocalDate } = {}
) {
  if (!bundle?.packet?.items || !Array.isArray(bundle.packet.itemIds)) {
    throw new TypeError('Review bundle is required for suggestion initialization.');
  }
  if (!applySuggestions) {
    return { ...clone(draft ?? {}), suggestionVersion: VERSION, decisions: withoutSuggestions(bundle, draft) };
  }
  if (
    draft &&
    Object.hasOwn(draft, 'suggestionVersion') &&
    draft.suggestionVersion !== VERSION
  ) {
    throw new TypeError('Unsupported suggestion version.');
  }
  if (draft?.suggestionVersion === VERSION) {
    return { ...clone(draft), decisions: clone(sourceDecisions(draft)) };
  }
  const sessionDate = getLocalDate?.();
  if (!validCalendarDate(sessionDate)) {
    throw new TypeError('getLocalDate must return a valid YYYY-MM-DD calendar date.');
  }
  const legacy = draft !== undefined;
  const source = sourceDecisions(draft);
  const byId = new Map(bundle.packet.items.map(item => [item.id, item]));
  const decisions = Object.fromEntries(
    bundle.packet.itemIds.map(itemId => {
      const base = Object.hasOwn(source, itemId) ? source[itemId] : emptyDecision();
      return [
        itemId,
        applySuggestion(base, byId.get(itemId).suggestedReview, sessionDate, legacy),
      ];
    })
  );
  return { ...clone(draft ?? {}), suggestionVersion: VERSION, decisions };
}
