import { element, text } from '../components/dom.mjs';
import { formatSubmittedAt } from './inbox-card-status.mjs';

function statePanel(title, detail) {
  return element('div', { attributes: { class: 'state-panel', role: 'status' } }, [
    element('strong', {}, [text(title)]),
    detail ? element('p', {}, [text(detail)]) : null,
  ]);
}

function historyCard(row, onOpenReceipt, onRequestChange) {
  const submitted = row.historyStatus === 'submitted';
  return element('article', { attributes: { class: 'history-card' } }, [
    element('div', { attributes: { class: 'history-card__status' } }, [
      element(
        'span',
        { attributes: { class: `history-status history-status--${row.historyStatus}` } },
        [text(submitted ? 'Dorëzuar' : 'Zëvendësuar')]
      ),
      element('span', { attributes: { class: 'canonical-id' } }, [text(row.packetId)]),
    ]),
    element('h2', {}, [text(row.title)]),
    element('div', { attributes: { class: 'history-card__meta' } }, [
      element('span', {}, [text(`Versioni ${row.receiptVersion}`)]),
      element('span', {}, [text(row.reviewerDisplayName)]),
      element('time', { attributes: { datetime: row.submittedAt } }, [
        text(formatSubmittedAt(row.submittedAt)),
      ]),
    ]),
    row.migration
      ? element('p', { attributes: { class: 'migration-lineage' } }, [
          text('Migruar nga vërtetimi '),
          element('code', { attributes: { class: 'audit-code', lang: 'en' } }, [
            text(row.migration.sourceReceiptId),
          ]),
        ])
      : null,
    element('div', { attributes: { class: 'history-card__actions' } }, [
      element(
        'button',
        {
          attributes: { class: 'primary-action', type: 'button' },
          on: { click: () => onOpenReceipt(row.receiptId) },
        },
        [text('Shiko vërtetimin')]
      ),
      submitted
        ? element(
            'button',
            {
              attributes: { class: 'secondary-action', type: 'button' },
              on: { click: () => onRequestChange(row.receiptId) },
            },
            [text('Kërko ndryshim')]
          )
        : null,
    ]),
  ]);
}

export function renderHistory({
  state,
  rows = [],
  message = '',
  onOpenReceipt = () => {},
  onRequestChange = () => {},
}) {
  const heading = element('div', { attributes: { class: 'page-heading history-heading' } }, [
    element('span', { attributes: { class: 'eyebrow' } }, [text('Arkivi lokal')]),
    element('h1', { attributes: { id: 'history-title', tabindex: '-1' } }, [
      text('Historia e shqyrtimeve'),
    ]),
    element('p', {}, [
      text(
        'Çdo dorëzim dhe version i zëvendësuar në këtë pajisje, pa ndryshuar provën origjinale.'
      ),
    ]),
  ]);
  const content =
    state === 'loading'
      ? [statePanel('Po ngarkohet historia…')]
      : state === 'unavailable'
        ? [statePanel('Historia nuk mund të hapet.', message)]
        : state === 'empty'
          ? [statePanel('Nuk ka ende shqyrtime të ruajtura.', 'Importo një vërtetim te Detyrat.')]
          : rows.map(row => historyCard(row, onOpenReceipt, onRequestChange));
  return element(
    'section',
    { attributes: { class: 'history', 'aria-labelledby': 'history-title' } },
    [heading, ...content]
  );
}
