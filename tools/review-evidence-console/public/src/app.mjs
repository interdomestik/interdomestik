import { createHeader, announce } from './components/status.mjs';
import { createFixtureRepository } from './data/fixture-repository.mjs';
import { element, replaceChildren, text } from './components/dom.mjs';
import { formatRoute } from './router.mjs';
import { parseRoute } from './router.mjs';
import { createWorkspaceRuntime } from './app/workspace-runtime.mjs';
import { loadInboxRows } from './views/inbox-data.mjs';
import { renderInbox } from './views/inbox.mjs';
import { renderWorkspace } from './views/workspace.mjs';

const REVIEWER_ID = 'reviewer_privacy_mk';
const repository = createFixtureRepository();
const app = document.querySelector('#app');
let workspaceRuntime;

function shell(content, role = 'Rishikues privatësie', saveStatus) {
  return [
    element('a', { attributes: { class: 'skip-link', href: '#main' } }, [
      text('Kalo te përmbajtja'),
    ]),
    createHeader(role, saveStatus),
    element('main', { attributes: { class: 'page-shell', id: 'main', tabindex: '-1' } }, [content]),
  ];
}

async function loadInbox() {
  workspaceRuntime?.dispose();
  workspaceRuntime = undefined;
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

async function loadWorkspace(route) {
  workspaceRuntime?.dispose();
  const result = await repository.loadAssignmentBundle(route.assignmentId);
  if (!result.ok || !result.value.packet.itemIds.includes(route.itemId)) {
    window.location.hash = '#/';
    return;
  }
  workspaceRuntime = createWorkspaceRuntime({
    bundle: result.value,
    initialItemId: route.itemId,
    onNavigate: (assignmentId, itemId) => {
      window.location.hash = formatRoute({ name: 'workspace', assignmentId, itemId });
    },
    onRender: props => {
      replaceChildren(app, shell(renderWorkspace(props), 'Rishikues privatësie', props.saveStatus));
      queueMicrotask(() => document.querySelector('#item-heading')?.focus());
    },
  });
}

function openAssignment(assignment) {
  window.location.hash = formatRoute({
    name: 'workspace',
    assignmentId: assignment.id,
    itemId: assignment.firstItemId,
  });
}

function route() {
  const current = parseRoute(window.location.hash);
  if (current.name === 'workspace') loadWorkspace(current);
  else loadInbox();
}

window.addEventListener('hashchange', route);
route();
