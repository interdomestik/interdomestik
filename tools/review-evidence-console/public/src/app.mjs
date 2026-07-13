import { createAuthRuntime } from './app/auth-runtime.mjs';
import { renderAuthView } from './app/auth-view.mjs';
import { applicationShell, focusControl } from './app/application-shell.mjs';
import { createReviewRouteLoaders } from './app/review-routes.mjs';
import { createRouteCoordinator } from './app/route-coordinator.mjs';
import { createWorkspaceRuntime } from './app/workspace-runtime.mjs';
import { announce } from './components/status.mjs';
import { replaceChildren } from './components/dom.mjs';
import { createApiClient } from './data/api-client.mjs';
import { createFixtureRepository } from './data/fixture-repository.mjs';
import { formatRoute, parseRoute } from './router.mjs';
import { loadInboxRows } from './views/inbox-data.mjs';
import { renderInbox } from './views/inbox.mjs';
import { renderWorkspace } from './views/workspace.mjs';

const client = createApiClient();
const repository = createFixtureRepository({ client });
const app = document.querySelector('#app');
const routes = createRouteCoordinator();
let account;
let workspaceRuntime;

const render = (content, role, saveStatus) =>
  replaceChildren(
    app,
    applicationShell({ content, role, saveStatus, account, onLogout: () => auth.logout() })
  );

const reviewRoutes = createReviewRouteLoaders({
  repository,
  isCurrent: token => routes.isCurrent(token),
  onSessionExpired: () => auth.expire(),
  navigate: value => (window.location.hash = formatRoute(value)),
  render: (content, role, focusId) => {
    render(Array.isArray(content) ? documentFragment(content) : content, role);
    if (focusId) queueMicrotask(() => focusControl(focusId));
  },
});

function documentFragment(content) {
  const wrapper = document.createElement('div');
  wrapper.append(...content);
  return wrapper;
}

function renderLoginState(state) {
  routes.invalidate();
  workspaceRuntime?.dispose();
  workspaceRuntime = undefined;
  account = undefined;
  render(
    renderAuthView(state, credentials => auth.login(credentials)),
    'Qasje e sigurt'
  );
  if (state.reason === 'authentication_failed') queueMicrotask(() => focusControl('login-error'));
}

const auth = createAuthRuntime({
  client,
  onLogoutError: () => announce('Dalja nuk u krye. Kontrolloni lidhjen dhe provoni përsëri.'),
  onState: state => {
    if (state.status !== 'authenticated') return renderLoginState(state);
    account = state.account;
    route();
  },
});

async function loadInbox(token) {
  workspaceRuntime?.dispose();
  workspaceRuntime = undefined;
  render(renderInbox({ state: 'loading' }));
  const profile = await repository.loadReviewerProfile();
  const rows = profile.ok
    ? await loadInboxRows(repository, profile.value.id, reviewRoutes.receiptStore)
    : profile;
  if (!routes.isCurrent(token)) return;
  if (!profile.ok || !rows.ok) {
    if ((profile.code ?? rows.code) === 'session_expired') return auth.expire();
    render(renderInbox({ state: 'unavailable', message: profile.message ?? rows.message }));
    return announce('Detyrat nuk mund të hapen.');
  }
  render(
    renderInbox({
      state: rows.value.length ? 'populated' : 'empty',
      assignments: rows.value,
      onOpen: openAssignment,
      onOpenReceipt: receiptId =>
        (window.location.hash = formatRoute({ name: 'receipt', receiptId })),
      onImport: async (assignment, file) => {
        const result = await reviewRoutes.importReceipt(assignment.id, file, token);
        if (!result.ok) announce(result.message);
      },
    }),
    profile.value.role
  );
  announce(rows.value.length ? `${rows.value.length} paketa u ngarkuan.` : 'Nuk ka paketa.');
}

async function loadWorkspace(current, token) {
  workspaceRuntime?.dispose();
  const result = await repository.loadAssignmentBundle(current.assignmentId);
  if (!routes.isCurrent(token)) return;
  if (!result.ok || !result.value.packet.itemIds.includes(current.itemId)) {
    if (result.code === 'session_expired') return auth.expire();
    window.location.hash = '#/';
    return;
  }
  workspaceRuntime = createWorkspaceRuntime({
    bundle: result.value,
    initialItemId: current.itemId,
    onNavigate: (assignmentId, itemId) =>
      (window.location.hash = formatRoute({ name: 'workspace', assignmentId, itemId })),
    onStatus: status => {
      const target = document.querySelector('.save-state');
      if (target) target.textContent = status;
    },
    onValidate: () =>
      (window.location.hash = formatRoute({
        name: 'validation',
        assignmentId: current.assignmentId,
      })),
    onRender: props => {
      render(renderWorkspace(props), account.role, props.saveStatus);
      const focus = reviewRoutes.takePendingFocus();
      if (focus) queueMicrotask(() => focusControl(focus));
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
  if (!account) return;
  const token = routes.begin();
  const current = parseRoute(window.location.hash);
  if (current.name === 'workspace') loadWorkspace(current, token);
  else if (current.name === 'validation') reviewRoutes.validation(current, token);
  else if (current.name === 'receipt') reviewRoutes.receipt(current, token);
  else loadInbox(token);
}

window.addEventListener('hashchange', route);
auth.start();
