import { element, text } from '../components/dom.mjs';

function metric(value, label, tone = '') {
  return element(
    'div',
    { attributes: { class: `queue-metric${tone ? ` queue-metric--${tone}` : ''}` } },
    [element('strong', {}, [text(value)]), element('span', {}, [text(label)])]
  );
}

export function renderInboxSummary(assignments) {
  const delivered = assignments.filter(row => row.submissionStatus === 'submitted').length;
  const active = assignments.length - delivered;
  return element(
    'aside',
    { attributes: { class: 'queue-summary', 'aria-label': 'Përmbledhja e punës' } },
    [
      metric(active, 'Në punë', active ? 'active' : ''),
      metric(delivered, 'Dorëzuar', delivered ? 'complete' : ''),
      metric('Aktive', 'Ruajtje lokale', 'local'),
    ]
  );
}
