import { element, text } from '../components/dom.mjs';
import { formField, selectField } from '../components/form-field.mjs';

export function renderCorrection({ receipt, itemIds, values, error, onChange, onSubmit }) {
  return element(
    'section',
    { attributes: { class: 'correction-view', 'aria-labelledby': 'correction-heading' } },
    [
      element('h1', { attributes: { id: 'correction-heading', tabindex: '-1' } }, [
        text('Krijo një korrigjim'),
      ]),
      element('p', {}, [
        text(`Vërtetimi i mëparshëm ${receipt.receiptId} mbetet i pandryshueshëm.`),
      ]),
      selectField({
        id: 'correction-item',
        label: 'Artikulli i saktë',
        required: true,
        value: values.itemId,
        options: itemIds,
        onInput: value => onChange('itemId', value),
      }),
      formField({
        id: 'correction-reason',
        label: 'Arsyeja e sigurt për repo',
        required: true,
        value: values.reason,
        maxLength: 1000,
        onInput: value => onChange('reason', value),
      }),
      formField({
        id: 'correction-impact',
        label: 'Ndikimi i sigurt për repo',
        required: true,
        value: values.impact,
        maxLength: 1000,
        onInput: value => onChange('impact', value),
      }),
      error ? element('p', { attributes: { role: 'alert' } }, [text(error)]) : null,
      element(
        'button',
        { attributes: { type: 'button', class: 'primary-action' }, on: { click: onSubmit } },
        [text('Hap hapësirën e korrigjimit')]
      ),
    ]
  );
}
