import { element, text } from '../components/dom.mjs';
import { displaySeverity } from '../components/display-labels.mjs';

const RISK = { high: 'Rrezik i lartë', medium: 'Rrezik mesatar', low: 'Rrezik i ulët' };
const riskCopy = value => RISK[value] ?? `Rrezik ${displaySeverity(value)}`;

export function renderInbox({
  state,
  assignments = [],
  message = '',
  onOpen = () => {},
  onImport = () => {},
}) {
  const heading = element('div', { attributes: { class: 'page-heading' } }, [
    element('span', { attributes: { class: 'eyebrow' } }, [text('Detyrat e mia')]),
    element('h1', { attributes: { id: 'inbox-title' } }, [text('Paketat për rishikim')]),
    element('p', {}, [text('Përfundo një paketë provash me vendime të qarta dhe të sigurta.')]),
  ]);
  if (state === 'loading') return inboxSection(heading, statePanel('Po ngarkohen detyrat…'));
  if (state === 'empty') return inboxSection(heading, statePanel('Nuk ka paketa të caktuara.'));
  if (state === 'unavailable') {
    return inboxSection(
      heading,
      statePanel('Detyrat nuk mund të hapen.', message || 'Provo përsëri më vonë.')
    );
  }
  return inboxSection(heading, ...assignments.map(row => assignmentCard(row, onOpen, onImport)));
}

function inboxSection(...children) {
  return element(
    'section',
    { attributes: { class: 'inbox', 'aria-label': 'Paketat e caktuara' } },
    children
  );
}

function assignmentCard(assignment, onOpen, onImport) {
  const helpId = `import-help-${assignment.id}`;
  const fileId = `receipt-file-${assignment.id}`;
  const file = element('input', {
    attributes: {
      id: fileId,
      class: 'receipt-picker__input',
      type: 'file',
      accept: 'application/json,.json',
      'aria-describedby': helpId,
    },
    on: { change: event => event.target.files?.[0] && onImport(assignment, event.target.files[0]) },
  });
  const action = assignment.status === 'in_progress' ? 'Vazhdo paketën' : 'Hap paketën';
  return element('article', { attributes: { class: 'assignment-card' } }, [
    element('span', { attributes: { class: 'canonical-id' } }, [text(assignment.packetId)]),
    element('h2', {}, [text(assignment.title)]),
    element('p', { attributes: { class: 'card-purpose' } }, [text(assignment.purpose)]),
    element('div', { attributes: { class: 'card-meta' } }, [
      label(riskCopy(assignment.risk), `risk risk--${assignment.risk}`, assignment.risk),
      label(assignment.progress, 'progress'),
      label(`Afati: ${assignment.dueDate}`, 'due-date'),
    ]),
    element(
      'button',
      {
        attributes: {
          class: 'primary-action',
          type: 'button',
          'aria-label': action,
        },
        on: { click: () => onOpen(assignment) },
      },
      [text(action)]
    ),
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

function label(copy, className, raw) {
  return element('span', { attributes: { class: className } }, [
    text(copy),
    raw ? element('code', { attributes: { class: 'audit-code', lang: 'en' } }, [text(raw)]) : null,
  ]);
}

function statePanel(title, detail) {
  return element('div', { attributes: { class: 'state-panel', role: 'status' } }, [
    element('strong', {}, [text(title)]),
    detail ? element('p', {}, [text(detail)]) : null,
  ]);
}
