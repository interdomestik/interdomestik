import { element, text } from '../components/dom.mjs';

export function renderReceiptPicker(assignment, onImport) {
  const helpId = `import-help-${assignment.id}`;
  const fileId = `receipt-file-${assignment.id}`;
  const file = element('input', {
    attributes: {
      id: fileId,
      class: 'receipt-picker__input',
      type: 'file',
      accept: 'application/json,.json',
      'aria-describedby': helpId,
      'aria-label': `Importo vërtetimin lokal JSON — ${assignment.packetId} — ${assignment.id}`,
    },
    on: { change: event => event.target.files?.[0] && onImport(assignment, event.target.files[0]) },
  });
  return element('details', { attributes: { class: 'receipt-import-disclosure' } }, [
    element('summary', {}, [text('Kam një vërtetim të përfunduar')]),
    element('div', { attributes: { class: 'import-receipt' } }, [
      element('label', { attributes: { class: 'receipt-picker', for: fileId } }, [
        element('span', { attributes: { class: 'receipt-picker__label' } }, [
          text('Importo vërtetimin lokal JSON'),
        ]),
        element('span', { attributes: { class: 'receipt-picker__button' } }, [
          text('Zgjidh vërtetimin JSON'),
        ]),
        file,
      ]),
      element('p', { attributes: { id: helpId } }, [
        text('Lexohet në këtë pajisje; nuk ngarkohet kurrë'),
      ]),
    ]),
  ]);
}
