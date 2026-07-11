import { element, text } from '../components/dom.mjs';

function controlId(itemId, key) {
  if (key === 'safeEvidenceConfirmed') return 'safe-evidence-confirmed';
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
        text('Përfundo shqyrtimin'),
      ]),
      element('p', {}, [
        text(`${validation.errorCount} fusha kërkojnë vëmendje para dërgimit.`),
      ]),
      ...validation.errors.map(entry => errorButton(entry, null, onFocusError)),
      ...groups.map(group =>
        element('section', { attributes: { class: 'validation-group' } }, [
          element('h2', {}, [text(group.itemId)]),
          ...group.errors.map(entry => errorButton(entry, group.itemId, onFocusError)),
        ])
      ),
      error ? element('p', { attributes: { role: 'alert' } }, [text(error.message)]) : null,
      validation.valid
        ? (() => {
            const button = element(
              'button',
              {
                attributes: {
                  type: 'button',
                  class: 'primary-action',
                  'aria-label': submitting ? 'Duke dërguar…' : 'Dërgo shqyrtimin',
                  ...(submitting
                    ? { disabled: 'disabled', 'aria-disabled': 'true', 'aria-busy': 'true' }
                    : {}),
                },
                on: { click: () => !submitting && onSubmit?.() },
              },
              [text(submitting ? 'Duke dërguar…' : 'Dërgo shqyrtimin')]
            );
            button.disabled = submitting;
            return button;
          })()
        : null,
    ]
  );
}
