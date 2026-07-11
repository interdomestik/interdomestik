import { element, text } from '../components/dom.mjs';
import {
  displayDecision,
  displayRisk,
  displaySeverity,
} from '../components/display-labels.mjs';
import { renderReceiptResponses } from './receipt-responses.mjs';

function row(label, value) {
  const values = Array.isArray(value) ? value : [typeof value === 'string' ? text(value) : value];
  return element('p', {}, [element('strong', {}, [text(`${label}: `)]), ...values]);
}

function audit(value) {
  return element('code', { attributes: { lang: 'en' } }, [text(value)]);
}

function labeled(label, raw) {
  return [text(`${label} `), audit(raw)];
}

function itemSection(itemId, decision, responses, item) {
  return element(
    'section',
    { attributes: { class: 'receipt-item', 'aria-labelledby': `receipt-${itemId}` } },
    [
      element('h2', { attributes: { id: `receipt-${itemId}` } }, [text(itemId)]),
      row('Vendimi', labeled(displayDecision(decision.decision), decision.decision)),
      row('Ashpërsia', labeled(displaySeverity(decision.severity), decision.severity)),
      row('Kategoria e rrezikut', labeled(displayRisk(decision.riskCategory), decision.riskCategory)),
      ...Object.entries({
        concreteAnswer: 'Përgjigjja konkrete',
        reason: 'Arsyeja',
        evidenceRef: 'Referenca e evidencës',
        verifiedAt: 'Data e verifikimit',
        requestedChange: 'Ndryshimi i kërkuar',
      })
        .filter(([key]) => decision[key])
        .map(([key, label]) => row(label, decision[key])),
      element('h2', {}, [text('Përgjigjet e strukturuara')]),
      ...renderReceiptResponses(item, responses),
    ]
  );
}

export function renderReceipt({ receipt, packet, importNotice, onExport, onCorrect, onClear }) {
  return element(
    'article',
    { attributes: { class: 'receipt-view', 'aria-labelledby': 'receipt-heading' } },
    [
      element('h1', { attributes: { id: 'receipt-heading', tabindex: '-1' } }, [
        text('Vërtetimi i shqyrtimit'),
      ]),
      row('ID-ja e vërtetimit', audit(receipt.receiptId)),
      row('Paketa', [audit(receipt.packetId), text(` · ${receipt.packetVersion}`)]),
      element('p', {}, [text(`Versioni ${receipt.receiptVersion}`)]),
      receipt.previousReceiptId ? row('Vërtetimi i mëparshëm', audit(receipt.previousReceiptId)) : null,
      receipt.correctionItemId ? row('Artikulli i korrigjimit', audit(receipt.correctionItemId)) : null,
      receipt.correctionReason ? row('Arsyeja e korrigjimit', receipt.correctionReason) : null,
      receipt.correctionImpact ? row('Ndikimi i korrigjimit', receipt.correctionImpact) : null,
      row('Shqyrtuesi', [text(`${receipt.reviewerDisplayName} · `), audit(receipt.reviewerRole)]),
      row('Dërguar më', receipt.submittedAt),
      row(
        'Rreziku',
        [
          ...labeled(displaySeverity(receipt.riskSummary.severity), receipt.riskSummary.severity),
          text(' · '),
          ...(receipt.riskSummary.categories.length
            ? receipt.riskSummary.categories.flatMap((value, index) => [
                index ? text(', ') : null,
                ...labeled(displayRisk(value), value),
              ])
            : labeled(displaySeverity('none'), 'none')),
        ].filter(Boolean)
      ),
      row('Autoriteti', [
        text('Vetëm shqyrtim lokal; nuk është autoritet ekzekutimi. '),
        audit(receipt.authorityDisclaimer),
      ]),
      importNotice
        ? element('p', { attributes: { class: 'local-only-notice' } }, [text(importNotice)])
        : null,
      ...Object.entries(receipt.decisions).map(([id, decision]) =>
        itemSection(
          id,
          decision,
          receipt.structuredResponses[id],
          packet?.items.find(item => item.id === id)
        )
      ),
      element('button', { attributes: { type: 'button' }, on: { click: () => onExport?.() } }, [
        text('Eksporto JSON'),
      ]),
      element('button', { attributes: { type: 'button' }, on: { click: () => onCorrect?.() } }, [
        text('Krijo korrigjim'),
      ]),
      element(
        'button',
        { attributes: { type: 'button' }, on: { click: () => onClear?.(receipt.receiptId) } },
        [text('Pastro këtë vërtetim')]
      ),
    ]
  );
}
