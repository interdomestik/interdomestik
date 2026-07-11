const DECISIONS = Object.freeze({
  approve: 'Mirato',
  change: 'Kërkon ndryshim',
  block: 'Blloko',
});

const RISKS = Object.freeze({
  access: 'Qasje',
  compliance: 'Pajtueshmëri',
  legal: 'Ligjor',
  other: 'Tjetër',
  privacy: 'Privatësi',
  scope: 'Fushëveprim',
  security: 'Siguri',
});

const SEVERITIES = Object.freeze({
  none: 'Asnjë',
  low: 'E ulët',
  medium: 'Mesatare',
  high: 'E lartë',
});

export const displayDecision = value => DECISIONS[value] ?? value;
export const displayRisk = value => RISKS[value] ?? value;
export const displaySeverity = value => SEVERITIES[value] ?? value;

export function displayOption(descriptor, value) {
  return { label: descriptor?.optionLabelsSq?.[value] ?? value, value };
}
