import { element, text } from '../components/dom.mjs';

export function renderJsonFallback(result, onCopy) {
  const area = element('textarea', {
    attributes: { readonly: 'readonly', rows: '12', 'aria-label': 'Receipt JSON fallback' },
  });
  area.value = result.text;
  return element('section', { attributes: { role: 'status', 'aria-live': 'polite' } }, [
    element('p', {}, [text(result.message)]),
    area,
    element('button', { attributes: { type: 'button' }, on: { click: onCopy } }, [
      text('Copy receipt JSON'),
    ]),
  ]);
}
