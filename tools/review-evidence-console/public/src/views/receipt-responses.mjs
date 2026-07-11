import { displayOption } from '../components/display-labels.mjs';
import { element, text } from '../components/dom.mjs';

const OPTION_TYPES = new Set(['select', 'radio', 'multi_select', 'checkbox_group']);

function audit(value) {
  return element('code', { attributes: { lang: 'en' } }, [text(value)]);
}

function displayValue(descriptor, value) {
  if (!OPTION_TYPES.has(descriptor?.type)) return [text(value)];
  const displayed = displayOption(descriptor, value);
  return [text(`${displayed.label} `), audit(displayed.value)];
}

function responseRow(descriptor, key, value) {
  const values = Array.isArray(value) ? value : [value];
  return element('p', {}, [
    element('strong', {}, [text(`${descriptor?.labelSq ?? key} `)]),
    audit(key),
    text(': '),
    ...values
      .flatMap((entry, index) => [index ? text(', ') : null, ...displayValue(descriptor, entry)])
      .filter(Boolean),
  ]);
}

export function renderReceiptResponses(item, responses = {}) {
  return Object.entries(responses).map(([key, value]) => {
    const descriptor = item?.requiredResponses.find(entry => entry.key === key);
    return responseRow(descriptor, key, value);
  });
}
