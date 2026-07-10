import { element, text } from '../components/dom.mjs';

function controlId(itemId, key) {
  if (key === 'decision') return `decision-${itemId}-approve`;
  if (
    [
      'concreteAnswer',
      'reason',
      'evidenceRef',
      'verifiedAt',
      'riskCategory',
      'severity',
      'requestedChange',
    ].includes(key)
  )
    return key;
  return `response-${key}`;
}

function errorButton(error, itemId, onFocusError) {
  return element(
    'button',
    {
      attributes: { type: 'button', class: 'validation-error' },
      on: { click: () => onFocusError?.(itemId, controlId(itemId, error.key)) },
    },
    [text(error.message)]
  );
}

export function renderValidation({
  validation,
  onFocusError,
  onSubmit,
  submitting = false,
  error,
}) {
  const groups = validation.items.filter(item => item.errors.length);
  return element(
    'section',
    { attributes: { class: 'validation-view', 'aria-labelledby': 'validation-heading' } },
    [
      element('h1', { attributes: { id: 'validation-heading', tabindex: '-1' } }, [
        text('Complete the review'),
      ]),
      element('p', {}, [text(`${validation.errorCount} fields need attention before submission.`)]),
      ...validation.errors.map(entry => errorButton(entry, null, onFocusError)),
      ...groups.map(group =>
        element('section', { attributes: { class: 'validation-group' } }, [
          element('h2', {}, [text(group.itemId)]),
          ...group.errors.map(entry => errorButton(entry, group.itemId, onFocusError)),
        ])
      ),
      error ? element('p', { attributes: { role: 'alert' } }, [text(error.message)]) : null,
      validation.valid
        ? element(
            'button',
            {
              attributes: {
                type: 'button',
                class: 'primary-action',
                'aria-label': submitting ? 'Submitting receipt' : 'Submit review',
              },
              on: { click: () => !submitting && onSubmit?.() },
            },
            [text(submitting ? 'Submitting…' : 'Submit review')]
          )
        : null,
    ]
  );
}
