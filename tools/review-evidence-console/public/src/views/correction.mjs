import { element, text } from '../components/dom.mjs';
import { formField, selectField } from '../components/form-field.mjs';

export function renderCorrection({ receipt, itemIds, values, error, onChange, onSubmit }) {
  return element(
    'section',
    { attributes: { class: 'correction-view', 'aria-labelledby': 'correction-heading' } },
    [
      element('h1', { attributes: { id: 'correction-heading', tabindex: '-1' } }, [
        text('Create a correction'),
      ]),
      element('p', {}, [text(`The prior receipt ${receipt.receiptId} remains immutable.`)]),
      selectField({
        id: 'correction-item',
        label: 'Exact item',
        required: true,
        value: values.itemId,
        options: itemIds,
        onInput: value => onChange('itemId', value),
      }),
      formField({
        id: 'correction-reason',
        label: 'Repo-safe reason',
        required: true,
        value: values.reason,
        maxLength: 1000,
        onInput: value => onChange('reason', value),
      }),
      formField({
        id: 'correction-impact',
        label: 'Repo-safe impact',
        required: true,
        value: values.impact,
        maxLength: 1000,
        onInput: value => onChange('impact', value),
      }),
      error ? element('p', { attributes: { role: 'alert' } }, [text(error)]) : null,
      element(
        'button',
        { attributes: { type: 'button', class: 'primary-action' }, on: { click: onSubmit } },
        [text('Open correction workspace')]
      ),
    ]
  );
}
