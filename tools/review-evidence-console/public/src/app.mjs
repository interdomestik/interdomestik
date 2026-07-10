import { createHeader, announce } from './components/status.mjs';
import { createFixtureRepository } from './data/fixture-repository.mjs';
import { element, replaceChildren, text } from './components/dom.mjs';
import { formatRoute } from './router.mjs';
import { renderInbox } from './views/inbox.mjs';

const REVIEWER_ID = 'reviewer_privacy_mk';
const repository = createFixtureRepository();
const app = document.querySelector('#app');

function shell(content, role = 'Rishikues privatësie') {
  return [
    element('a', { attributes: { class: 'skip-link', href: '#main' } }, [
      text('Kalo te përmbajtja'),
    ]),
    createHeader(role),
    element('main', { attributes: { class: 'page-shell', id: 'main', tabindex: '-1' } }, [content]),
  ];
}

async function loadInbox() {
  replaceChildren(app, shell(renderInbox({ state: 'loading' })));
  const [profile, assignments] = await Promise.all([
    repository.loadReviewerProfile(REVIEWER_ID),
    repository.listAssignments(REVIEWER_ID),
  ]);
  if (!profile.ok || !assignments.ok) {
    const message = profile.message ?? assignments.message;
    replaceChildren(app, shell(renderInbox({ state: 'unavailable', message })));
    announce('Detyrat nuk mund të hapen.');
    return;
  }
  const rows = await Promise.all(assignments.value.map(toInboxAssignment));
  if (rows.some(row => !row)) {
    replaceChildren(
      app,
      shell(renderInbox({ state: 'unavailable', message: 'Packet fixture is invalid.' }))
    );
    announce('Një paketë nuk është e disponueshme.');
    return;
  }
  const role = profile.value.role === 'privacy' ? 'Rishikues privatësie' : profile.value.role;
  const view = renderInbox({
    state: rows.length ? 'populated' : 'empty',
    assignments: rows,
    onOpen: openAssignment,
  });
  replaceChildren(app, shell(view, role));
  announce(rows.length ? `${rows.length} paketa u ngarkuan.` : 'Nuk ka paketa të caktuara.');
}

async function toInboxAssignment(assignment) {
  const packet = await repository.loadPacket(assignment.packetId);
  if (!packet.ok) return null;
  const part = assignment.packetId.endsWith('part-a') ? 'A' : 'B';
  const purpose =
    part === 'A'
      ? 'Verifiko kufijtë e privatësisë, pëlqimin dhe rolet e aksesit.'
      : 'Verifiko kufijtë e dokumenteve, kërcënimet dhe kushtet e ndalimit.';
  return {
    ...assignment,
    firstItemId: packet.value.itemIds[0],
    title: `Rishikimi i autoritetit — Pjesa ${part}`,
    purpose,
    progress: assignment.status === 'in_progress' ? '2 nga 4 pika' : '0 nga 4 pika',
  };
}

function openAssignment(assignment) {
  window.location.hash = formatRoute({
    name: 'workspace',
    assignmentId: assignment.id,
    itemId: assignment.firstItemId,
  });
}

loadInbox();
