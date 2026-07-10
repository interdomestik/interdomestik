import { createHeader, announce } from './components/status.mjs';
import { createFixtureRepository } from './data/fixture-repository.mjs';
import { element, replaceChildren, text } from './components/dom.mjs';
import { formatRoute } from './router.mjs';
import { loadInboxRows } from './views/inbox-data.mjs';
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
  const [profile, rows] = await Promise.all([
    repository.loadReviewerProfile(REVIEWER_ID),
    loadInboxRows(repository, REVIEWER_ID),
  ]);
  if (!profile.ok || !rows.ok) {
    const message = profile.message ?? rows.message;
    replaceChildren(app, shell(renderInbox({ state: 'unavailable', message })));
    announce('Detyrat nuk mund të hapen.');
    return;
  }
  const role = profile.value.role === 'privacy' ? 'Rishikues privatësie' : profile.value.role;
  const view = renderInbox({
    state: rows.value.length ? 'populated' : 'empty',
    assignments: rows.value,
    onOpen: openAssignment,
  });
  replaceChildren(app, shell(view, role));
  announce(
    rows.value.length ? `${rows.value.length} paketa u ngarkuan.` : 'Nuk ka paketa të caktuara.'
  );
}

function openAssignment(assignment) {
  window.location.hash = formatRoute({
    name: 'workspace',
    assignmentId: assignment.id,
    itemId: assignment.firstItemId,
  });
}

loadInbox();
