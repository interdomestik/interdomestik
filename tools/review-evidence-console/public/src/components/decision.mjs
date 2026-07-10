import { element, text } from './dom.mjs';
import { displayDecision, displayOption } from './display-labels.mjs';
import { formField, selectField } from './form-field.mjs';
import {
  descriptorIsApplicable,
  descriptorIsRequired,
} from '../validation/descriptor-required.mjs';

const DECISIONS = ['approve', 'change', 'block'];

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
      ...DECISIONS.map(value =>
        radio(item.id, value, displayDecision(value), decision.decision, onDecision)
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
    ...item.requiredResponses
      .filter(descriptor => descriptorIsApplicable(descriptor, decision.responses))
      .map(descriptor => descriptorField(descriptor, decision.responses, onResponse)),
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
  const id = `decision-${itemId}-${value}`;
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
    element('code', { attributes: { lang: 'en' } }, [text(value)]),
  ]);
}

function descriptorField(descriptor, responses, onResponse) {
  const value = responses[descriptor.key];
  const common = {
    id: `response-${descriptor.key}`,
    label: descriptor.labelSq,
    value,
    required: descriptorIsRequired(descriptor, responses),
    onInput: next => onResponse(descriptor.key, next, `response-${descriptor.key}`),
  };
  if (['radio', 'checkbox_group', 'multi_select'].includes(descriptor.type)) {
    return optionGroup(descriptor, value, onResponse, common.required);
  }
  if (descriptor.type === 'select') {
    return selectField({
      ...common,
      options: descriptor.options.map(option => displayOption(descriptor, option)),
    });
  }
  return formField({
    ...common,
    type:
      descriptor.type === 'date' ? 'date' : descriptor.type === 'textarea' ? 'textarea' : 'text',
    maxLength: descriptor.maxLength,
  });
}

function optionGroup(descriptor, current, onResponse, required) {
  const checkbox = descriptor.type !== 'radio';
  let selected = checkbox && Array.isArray(current) ? [...current] : [];
  return element(
    'fieldset',
    {
      attributes: {
        class: 'descriptor-options',
        ...(required ? { 'aria-required': 'true' } : {}),
      },
    },
    [
      element('legend', {}, [text(descriptor.labelSq)]),
      ...descriptor.options.map((option, index) => {
        const displayed = displayOption(descriptor, option);
        const id = `response-${descriptor.key}-${index}`;
        const input = element('input', {
          attributes: {
            id,
            name: `response-${descriptor.key}`,
            type: checkbox ? 'checkbox' : 'radio',
            value: option,
            ...(required && !checkbox ? { required: 'required' } : {}),
          },
          on: {
            change: event => {
              if (!checkbox) return onResponse(descriptor.key, option, id);
              selected = toggle(selected, option, event.target.checked);
              return onResponse(descriptor.key, [...selected], id);
            },
          },
        });
        input.value = option;
        input.checked = checkbox ? selected.includes(option) : current === option;
        return element('label', { attributes: { class: 'decision-option', for: id } }, [
          input,
          text(displayed.label),
          element('code', { attributes: { lang: 'en' } }, [text(displayed.value)]),
        ]);
      }),
    ]
  );
}

function toggle(values, option, checked) {
  return checked ? [...new Set([...values, option])] : values.filter(value => value !== option);
}
