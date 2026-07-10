import { element, text } from './dom.mjs';
import { formField, selectField } from './form-field.mjs';

const DECISIONS = [
  ['approve', 'Mirato'],
  ['change', 'Kërkon ndryshim'],
  ['block', 'Blloko'],
];

export function renderDecision({
  item,
  decision,
  onDecision = () => {},
  onField = () => {},
  onResponse = () => {},
}) {
  return element('div', { attributes: { class: 'decision-form' } }, [
    element('fieldset', {}, [
      element('legend', {}, [text('Vendimi')]),
      ...DECISIONS.map(([value, label]) =>
        radio(item.id, value, label, decision.decision, onDecision)
      ),
    ]),
    formField({
      id: 'concreteAnswer',
      label: 'Përgjigjja konkrete',
      type: 'textarea',
      required: true,
      value: decision.concreteAnswer,
      onInput: value => onField('concreteAnswer', value),
    }),
    formField({
      id: 'reason',
      label: 'Arsyeja',
      type: 'textarea',
      required: true,
      value: decision.reason,
      onInput: value => onField('reason', value),
    }),
    ...item.requiredResponses.map(descriptor =>
      descriptorField(descriptor, decision.responses[descriptor.key], onResponse)
    ),
    decision.decision === 'change' || decision.decision === 'block'
      ? formField({
          id: 'requestedChange',
          label: 'Ndryshimi i kërkuar',
          required: true,
          value: decision.requestedChange,
          onInput: value => onField('requestedChange', value),
        })
      : null,
  ]);
}

function radio(itemId, value, label, selected, onDecision) {
  const id = `decision-${value}`;
  const input = element('input', {
    attributes: { id, name: `decision-${itemId}`, type: 'radio', value },
    on: { change: () => onDecision(value) },
  });
  input.value = value;
  input.checked = selected === value;
  if (input.checked) input.setAttribute('checked', 'checked');
  return element('label', { attributes: { class: 'decision-option', for: id } }, [
    input,
    text(label),
  ]);
}

function descriptorField(descriptor, value, onResponse) {
  const common = {
    id: `response-${descriptor.key}`,
    label: descriptor.labelSq,
    value,
    required: descriptor.required,
    onInput: next => onResponse(descriptor.key, next),
  };
  if (descriptor.type === 'select' || descriptor.type === 'multiselect')
    return selectField({ ...common, options: descriptor.options });
  return formField({
    ...common,
    type: descriptor.type === 'date' ? 'date' : 'text',
    maxLength: descriptor.maxLength,
  });
}
