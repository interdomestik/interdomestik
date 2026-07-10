import { element, text } from './dom.mjs';

export function formField({
  id,
  label,
  value = '',
  type = 'text',
  required = false,
  maxLength,
  onInput,
}) {
  const input = element(type === 'textarea' ? 'textarea' : 'input', {
    attributes: {
      id,
      name: id,
      'aria-describedby': `${id}-error`,
      ...(type === 'textarea' ? { rows: '4' } : { type }),
      ...(required ? { required: 'required' } : {}),
      ...(required ? { 'aria-required': 'true' } : {}),
      ...(maxLength ? { maxlength: maxLength } : {}),
    },
    on: { input: event => onInput?.(event.target.value) },
  });
  input.value = value;
  return element('div', { attributes: { class: 'form-field' } }, [
    element('label', { attributes: { for: id } }, [
      text(label),
      required ? text(' (e detyrueshme)') : null,
    ]),
    input,
    element('p', {
      attributes: { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' },
    }),
  ]);
}

export function selectField({ id, label, value = '', options, required = false, onInput }) {
  const select = element(
    'select',
    {
      attributes: {
        id,
        name: id,
        ...(required ? { required: 'required', 'aria-required': 'true' } : {}),
      },
      on: { change: event => onInput?.(event.target.value) },
    },
    [
      element('option', { attributes: { value: '' } }, [text('Zgjidh')]),
      ...options.map(option =>
        element('option', { attributes: { value: option } }, [text(option)])
      ),
    ]
  );
  select.value = value;
  return element('div', { attributes: { class: 'form-field' } }, [
    element('label', { attributes: { for: id } }, [
      text(label),
      required ? text(' (e detyrueshme)') : null,
    ]),
    select,
  ]);
}
