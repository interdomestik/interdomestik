import { element, text } from '../components/dom.mjs';

export function renderReceiptPicker(assignment, onImport, legacy = false) {
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
  const picker = element('div', { attributes: { class: 'import-receipt' } }, [
    element('label', { attributes: { class: `receipt-picker${legacy ? ' receipt-picker--legacy' : ''}`, for: fileId } }, [
      element('span', { attributes: { class: 'receipt-picker__label' } }, [
        text(legacy ? 'Zgjidh vërtetimin e dorëzuar JSON' : 'Importo vërtetimin lokal JSON'),
      ]),
      element('span', { attributes: { class: 'receipt-picker__button' } }, [
        text(legacy ? 'Migro vërtetimin e dorëzuar' : 'Zgjidh vërtetimin JSON'),
      ]),
      file,
    ]),
    element('p', { attributes: { id: helpId } }, [
      text(
        legacy
          ? 'Konfirmimi ruan përgjigjet ekzistuese dhe krijon vetëm gjurmën e migrimit.'
          : 'Lexohet në këtë pajisje; nuk ngarkohet kurrë'
      ),
    ]),
  ]);
  if (legacy) return picker;
  return element('details', { attributes: { class: 'receipt-import-disclosure' } }, [
    element('summary', {}, [text('Kam një vërtetim të përfunduar')]),
    picker,
  ]);
}
