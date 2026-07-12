import { element, text } from '../components/dom.mjs';

const DATE_FORMATTER = new Intl.DateTimeFormat('sq-AL', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: 'long',
  timeZone: 'Europe/Skopje',
  year: 'numeric',
});
const status = (copy, value) =>
  element(
    'span',
    { attributes: { class: 'submission-status', ...(value ? { 'data-status': value } : {}) } },
    [text(copy)]
  );

export function formatSubmittedAt(value, formatter = DATE_FORMATTER) {
  return formatter.format(new Date(value));
}

export function submissionDetails(assignment) {
  if (assignment.submissionStatus === 'submitted') {
    return [
      status('Dorëzuar', 'submitted'),
      status(`Versioni i paketës: ${assignment.packetVersion}`),
      element('span', { attributes: { class: 'submission-status' } }, [
        text('Dorëzuar më: '),
        element('time', { attributes: { datetime: assignment.submittedAt } }, [
          text(`${formatSubmittedAt(assignment.submittedAt)} — Ora lokale e Shkupit`),
        ]),
      ]),
      element('span', { attributes: { class: 'submission-status' } }, [
        text('ID-ja e vërtetimit: '),
        element('code', { attributes: { class: 'audit-code', lang: 'en' } }, [
          text(assignment.receiptId),
        ]),
      ]),
    ];
  }
  if (assignment.submissionStatus === 'review_required') {
    return [status('Kërkon rishqyrtim — disponohet version i ri', 'review-required')];
  }
  return assignment.nextAction ? [status('Hapi i radhës', 'next-action')] : [];
}

export function cardAction(assignment) {
  if (assignment.submissionStatus === 'submitted') return 'Shiko vërtetimin';
  return assignment.status === 'in_progress' ? 'Vazhdo paketën' : 'Hap paketën';
}
