import { element, text } from './dom.mjs';
import { formField, selectField } from './form-field.mjs';

export function renderEvidenceRail({
  item,
  decision,
  safeEvidenceConfirmed,
  onField = () => {},
  onSafeEvidence = () => {},
}) {
  const check = element('input', {
    attributes: { id: 'safe-evidence-confirmed', type: 'checkbox' },
    on: { change: event => onSafeEvidence(event.target.checked) },
  });
  check.checked = safeEvidenceConfirmed === true;
  return element(
    'aside',
    { attributes: { class: 'evidence-rail', 'aria-label': 'Evidenca e rishikimit' } },
    [
      element('h2', {}, [text('Evidenca')]),
      formField({
        id: 'evidenceRef',
        label: 'Referenca repo-safe',
        required: true,
        value: decision.evidenceRef,
        onInput: value => onField('evidenceRef', value),
      }),
      formField({
        id: 'verifiedAt',
        label: 'Data e verifikimit',
        type: 'date',
        required: true,
        value: decision.verifiedAt,
        onInput: value => onField('verifiedAt', value),
      }),
      selectField({
        id: 'riskCategory',
        label: 'Kategoria e rrezikut',
        required: true,
        value: decision.riskCategory,
        options: item.allowedRiskCategories,
        onInput: value => onField('riskCategory', value),
      }),
      selectField({
        id: 'severity',
        label: 'Ashpërsia',
        required: true,
        value: decision.severity,
        options: ['none', 'low', 'medium', 'high'],
        onInput: value => onField('severity', value),
      }),
      element('label', { attributes: { class: 'safe-evidence', for: 'safe-evidence-confirmed' } }, [
        check,
        text('Konfirmoj se evidenca është repo-safe dhe nuk përmban të dhëna klienti.'),
      ]),
    ]
  );
}
