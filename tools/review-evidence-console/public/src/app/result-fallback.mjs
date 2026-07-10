import { element, text } from '../components/dom.mjs';

export function renderJsonFallback(result, onCopy) {
  if (!result.text) {
    return element('p', { attributes: { role: 'alert', 'aria-live': 'assertive' } }, [
      text(result.message || 'Veprimi me vërtetimin dështoi.'),
    ]);
  }
  const area = element('textarea', {
    attributes: { readonly: 'readonly', rows: '12', 'aria-label': 'JSON-i rezervë i vërtetimit' },
  });
  area.value = result.text;
  return element('section', { attributes: { role: 'status', 'aria-live': 'polite' } }, [
    element('p', {}, [text(result.message)]),
    area,
    element('button', { attributes: { type: 'button' }, on: { click: onCopy } }, [
      text('Kopjo JSON-in e vërtetimit'),
    ]),
  ]);
}
