import { element, text } from '../components/dom.mjs';

export function confirmLegacyMigration(summary, root = globalThis.document?.body) {
  if (!root) return Promise.resolve(false);
  return new Promise(resolve => {
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      dialog.close?.();
      dialog.remove?.();
      resolve(value);
    };
    const cancel = element(
      'button',
      {
        attributes: { class: 'secondary-action', type: 'button' },
        on: { click: () => finish(false) },
      },
      [text('Anulo')]
    );
    const confirm = element(
      'button',
      {
        attributes: { class: 'primary-action', type: 'button' },
        on: { click: () => finish(true) },
      },
      [text('Konfirmo migrimin')]
    );
    const dialog = element(
      'dialog',
      {
        attributes: {
          class: 'migration-dialog',
          'aria-labelledby': 'migration-heading',
          'aria-describedby': 'migration-description',
        },
        on: {
          cancel: event => {
            event.preventDefault();
            finish(false);
          },
        },
      },
      [
        element('span', { attributes: { class: 'eyebrow' } }, [text('Vërtetim i mëparshëm')]),
        element('h2', { attributes: { id: 'migration-heading' } }, [
          text('Migro shqyrtimin e përfunduar'),
        ]),
        element('p', { attributes: { id: 'migration-description' } }, [
          text(
            'Përgjigjet nuk ndryshohen. Konsola verifikon vërtetimin dhe krijon një version të nënshkruar me gjurmë migrimi.'
          ),
        ]),
        element('p', { attributes: { class: 'migration-dialog__receipt' } }, [
          text('Vërtetimi burimor: '),
          element('code', { attributes: { class: 'audit-code', lang: 'en' } }, [
            text(summary.sourceReceiptId),
          ]),
        ]),
        element('div', { attributes: { class: 'dialog-actions' } }, [cancel, confirm]),
      ]
    );
    root.append(dialog);
    dialog.showModal?.();
    confirm.focus?.();
  });
}
