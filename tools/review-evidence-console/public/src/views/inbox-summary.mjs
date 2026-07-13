import { element, text } from '../components/dom.mjs';

function metric(value, label, tone = '') {
  const modifier = tone ? ` queue-metric--${tone}` : '';
  return element('div', { attributes: { class: `queue-metric${modifier}` } }, [
    element('strong', {}, [text(value)]),
    element('span', {}, [text(label)]),
  ]);
}

export function renderInboxSummary(assignments) {
  const delivered = assignments.filter(row =>
    ['submitted', 'legacy_submitted'].includes(row.submissionStatus)
  ).length;
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
