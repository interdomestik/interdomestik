import { createHeader, announce } from './components/status.mjs';
import { createFixtureRepository } from './data/fixture-repository.mjs';
import { element, replaceChildren, text } from './components/dom.mjs';
import { formatRoute } from './router.mjs';
import { parseRoute } from './router.mjs';
import { createWorkspaceRuntime } from './app/workspace-runtime.mjs';
import { createRouteCoordinator } from './app/route-coordinator.mjs';
import { loadInboxRows } from './views/inbox-data.mjs';
import { renderInbox } from './views/inbox.mjs';
import { renderWorkspace } from './views/workspace.mjs';
import { createReviewRouteLoaders } from './app/review-routes.mjs';

const REVIEWER_ID = 'reviewer_governance_mk';
const repository = createFixtureRepository();
const app = document.querySelector('#app');
let workspaceRuntime;
const routes = createRouteCoordinator();

function focusControl(controlId) {
  const selector = `#${controlId}`;
  const direct = document.querySelector(selector);
  const grouped = direct ?? document.querySelector(`[name="${controlId}"]`);
  grouped?.focus();
}
const reviewRoutes = createReviewRouteLoaders({
  repository,
  isCurrent: token => routes.isCurrent(token),
  navigate: value => {
    window.location.hash = formatRoute(value);
  },
  render: (content, role, focusId) => {
    replaceChildren(
      app,
      shell(Array.isArray(content) ? element('div', {}, content) : content, role)
    );
    if (focusId) queueMicrotask(() => focusControl(focusId));
  },
});

function shell(content, role = 'Rishikues privatësie', saveStatus) {
  return [
    element('a', { attributes: { class: 'skip-link', href: '#main' } }, [
      text('Kalo te përmbajtja'),
    ]),
    createHeader(role, saveStatus),
    element('main', { attributes: { class: 'page-shell', id: 'main', tabindex: '-1' } }, [content]),
  ];
}

async function loadInbox(token) {
  workspaceRuntime?.dispose();
  workspaceRuntime = undefined;
  replaceChildren(app, shell(renderInbox({ state: 'loading' })));
  const [profile, rows] = await Promise.all([
    repository.loadReviewerProfile(REVIEWER_ID),
    loadInboxRows(repository, REVIEWER_ID, reviewRoutes.receiptStore),
  ]);
  if (!routes.isCurrent(token)) return;
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
    onOpenReceipt: receiptId => {
      if (routes.isCurrent(token)) {
        window.location.hash = formatRoute({ name: 'receipt', receiptId });
      }
    },
    onImport: async (assignment, file) => {
      const result = await reviewRoutes.importReceipt(assignment.id, file, token);
      if (!result.ok) announce(result.message);
    },
  });
  replaceChildren(app, shell(view, role));
  announce(
    rows.value.length ? `${rows.value.length} paketa u ngarkuan.` : 'Nuk ka paketa të caktuara.'
  );
}

async function loadWorkspace(route, token) {
  workspaceRuntime?.dispose();
  const result = await repository.loadAssignmentBundle(route.assignmentId);
  if (!routes.isCurrent(token)) return;
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
    onStatus: status => {
      const target = document.querySelector('.save-state');
      if (target) target.textContent = status;
    },
    onValidate: () => {
      window.location.hash = formatRoute({ name: 'validation', assignmentId: route.assignmentId });
    },
    onRender: props => {
      replaceChildren(app, shell(renderWorkspace(props), 'Rishikues privatësie', props.saveStatus));
      const pendingFocus = reviewRoutes.takePendingFocus();
      if (pendingFocus) queueMicrotask(() => focusControl(pendingFocus));
      else if (props.focusHeading)
        queueMicrotask(() => document.querySelector('#item-heading')?.focus());
      else if (props.focusControlId) queueMicrotask(() => focusControl(props.focusControlId));
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
  const token = routes.begin();
  const current = parseRoute(window.location.hash);
  if (current.name === 'workspace') loadWorkspace(current, token);
  else if (current.name === 'validation') reviewRoutes.validation(current, token);
  else if (current.name === 'receipt') reviewRoutes.receipt(current, token);
  else loadInbox(token);
}

window.addEventListener('hashchange', route);
route();
