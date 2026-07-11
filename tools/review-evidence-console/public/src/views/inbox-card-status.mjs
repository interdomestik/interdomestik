import { element, text } from '../components/dom.mjs';

const status = copy =>
  element('span', { attributes: { class: 'submission-status' } }, [text(copy)]);

export function submissionDetails(assignment) {
  if (assignment.submissionStatus === 'submitted') {
    return [
      status(`Versioni i paketës: ${assignment.packetVersion}`),
      status(`Dorëzuar më: ${assignment.submittedAt}`),
      element('span', { attributes: { class: 'submission-status' } }, [
        text('ID-ja e vërtetimit: '),
        element('code', { attributes: { class: 'audit-code', lang: 'en' } }, [
          text(assignment.receiptId),
        ]),
      ]),
    ];
  }
  if (assignment.submissionStatus === 'review_required') {
    return [status('Kërkon rishqyrtim — disponohet version i ri')];
  }
  return assignment.nextAction ? [status('Hapi i radhës')] : [];
}

export function cardAction(assignment) {
  if (assignment.submissionStatus === 'submitted') return 'Shiko vërtetimin';
  return assignment.status === 'in_progress' ? 'Vazhdo paketën' : 'Hap paketën';
}
