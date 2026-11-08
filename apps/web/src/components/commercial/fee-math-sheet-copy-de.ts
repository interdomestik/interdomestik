import type { FeeMathSheetCopy } from './fee-math-sheet-copy';

export const DE_FEE_MATH_SHEET_COPY: FeeMathSheetCopy = {
  eyebrow: 'Behandlung der Kosten im Gerichtsweg',
  title: 'Gerichtskosten werden schriftlich vereinbart, bevor der Gerichtsweg beginnt',
  body: 'Ohne Erstattung fällt kein Erfolgshonorar an Interdomestik an. Externe Kosten des Gerichtswegs werden nicht pauschal als null zugesagt; sie werden durch die schriftliche Vereinbarung zum Gerichtsweg geregelt, bevor die Kosten entstehen.',
  treatmentLabel: 'Schriftliche Vereinbarung erforderlich',
  rows: [
    {
      key: 'fees.lossPromise',
      label: 'Kein Erfolgshonorar ohne Erstattung',
      body: 'Wenn es keine Erstattung gibt, fällt kein Erfolgshonorar an Interdomestik an.',
    },
    {
      key: 'fees.courtPathCosts',
      label: 'Der Gerichtsweg wird vorab offengelegt',
      body: 'Die Kosten des Gerichtswegs müssen schriftlich offengelegt werden, bevor der Fall vor Gericht geht.',
    },
    {
      key: 'fees.thirdPartyCosts',
      label: 'Kosten Dritter können separat bleiben',
      body: 'Feste Gerichtsgebühren, Entscheidungsgebühren und Kosten für Obergutachten können bei schriftlicher Vereinbarung in der Verantwortung des Kunden bleiben.',
    },
    {
      key: 'fees.reimbursement',
      label: 'Vom Gericht zugesprochene Erstattung',
      body: 'Die Erstattung von Kosten, die Interdomestik vorab bezahlt hat, fließt an Interdomestik zurück, wenn sie durch Gerichtsentscheidung zugesprochen wird.',
    },
  ],
};
