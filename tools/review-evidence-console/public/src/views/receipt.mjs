import { element, text } from '../components/dom.mjs';

function row(label, value) {
  return element('p', {}, [element('strong', {}, [text(`${label}: `)]), text(value)]);
}

function itemSection(itemId, decision, responses) {
  return element(
    'section',
    { attributes: { class: 'receipt-item', 'aria-labelledby': `receipt-${itemId}` } },
    [
      element('h2', { attributes: { id: `receipt-${itemId}` } }, [text(itemId)]),
      row('Decision', decision.decision),
      row('Severity', decision.severity),
      row('Risk category', decision.riskCategory),
      ...['concreteAnswer', 'reason', 'evidenceRef', 'verifiedAt', 'requestedChange']
        .filter(key => decision[key])
        .map(key => row(key, decision[key])),
      element('h2', {}, [text('Structured responses')]),
      ...Object.entries(responses ?? {}).map(([key, value]) =>
        row(key, Array.isArray(value) ? value.join(', ') : value)
      ),
    ]
  );
}

export function renderReceipt({ receipt, importNotice, onExport, onCorrect, onClear }) {
  return element(
    'article',
    { attributes: { class: 'receipt-view', 'aria-labelledby': 'receipt-heading' } },
    [
      element('h1', { attributes: { id: 'receipt-heading', tabindex: '-1' } }, [
        text('Review receipt'),
      ]),
      row('Receipt ID', receipt.receiptId),
      row('Packet', `${receipt.packetId} · ${receipt.packetVersion}`),
      element('p', {}, [text(`Version ${receipt.receiptVersion}`)]),
      receipt.previousReceiptId ? row('Previous receipt', receipt.previousReceiptId) : null,
      receipt.correctionItemId ? row('Correction item', receipt.correctionItemId) : null,
      receipt.correctionReason ? row('Correction reason', receipt.correctionReason) : null,
      receipt.correctionImpact ? row('Correction impact', receipt.correctionImpact) : null,
      row('Reviewer', `${receipt.reviewerDisplayName} · ${receipt.reviewerRole}`),
      row('Submitted', receipt.submittedAt),
      row(
        'Risk',
        `${receipt.riskSummary.severity} · ${receipt.riskSummary.categories.join(', ') || 'none'}`
      ),
      row('Authority', receipt.authorityDisclaimer),
      importNotice
        ? element('p', { attributes: { class: 'local-only-notice' } }, [text(importNotice)])
        : null,
      ...Object.entries(receipt.decisions).map(([id, decision]) =>
        itemSection(id, decision, receipt.structuredResponses[id])
      ),
      element('button', { attributes: { type: 'button' }, on: { click: () => onExport?.() } }, [
        text('Export JSON'),
      ]),
      element('button', { attributes: { type: 'button' }, on: { click: () => onCorrect?.() } }, [
        text('Create correction'),
      ]),
      element(
        'button',
        { attributes: { type: 'button' }, on: { click: () => onClear?.(receipt.receiptId) } },
        [text('Clear this receipt')]
      ),
    ]
  );
}
