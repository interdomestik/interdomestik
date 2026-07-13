import { composeDraftKey, createDraftStore } from '../state/draft-store.mjs';
import { createDraftContextSchema } from '../state/draft-context-schema.mjs';
import { createReviewSession } from '../state/review-session.mjs';
import { createSubmissionController } from './submission-controller.mjs';
import { renderValidation } from '../views/validation.mjs';

export async function loadValidationRoute({
  route,
  repository,
  receiptStore,
  directoryWriter,
  render,
  navigate,
  focus,
  current = () => true,
}) {
  const loaded = await repository.loadAssignmentBundle(route.assignmentId);
  if (!current()) return;
  if (!loaded.ok) return navigate({ name: 'inbox' });
  const bundle = loaded.value;
  const key = composeDraftKey({
    assignmentId: bundle.assignment.id,
    reviewerFixtureId: bundle.reviewer.id,
    draftScope: bundle.reviewer.draftScope ?? `draft_fixture_${bundle.reviewer.id}`,
    packetVersion: bundle.packet.version,
  });
  const stored = createDraftStore({
    schemaVersion: 1,
    contextSchema: createDraftContextSchema(bundle.packet),
  }).load(key);
  const draft = stored.ok ? stored.value : undefined;
  const session = createReviewSession(bundle, draft);
  const safe = draft?.safeEvidenceConfirmed === true;
  const controller = createSubmissionController({
    bundle,
    receiptStore,
    directoryWriter,
    ...(repository.buildReceipt ? { buildReceipt: repository.buildReceipt } : {}),
    onInbox: () => current() && navigate({ name: 'inbox' }),
    onReceipt: receiptId => current() && navigate({ name: 'receipt', receiptId }),
    onStatus: () => current() && draw(false),
  });
  function draw(focusHeading = false) {
    const status = controller.getStatus();
    render(
      renderValidation({
        validation: session.validate(safe),
        submitting: status.submitting,
        error: status.error,
        onFocusError: (itemId, controlId) => {
          focus(controlId);
          navigate({
            name: 'workspace',
            assignmentId: route.assignmentId,
            itemId: itemId ?? bundle.packet.itemIds[0],
          });
        },
        onSubmit: () => controller.submit(session.getSnapshot(), safe),
      }),
      bundle.reviewer.displayName,
      focusHeading ? 'validation-heading' : null
    );
  }
  draw(true);
}

export function createValidationHandler(options) {
  return (route, token) => {
    if (!options.isCurrent(token)) return;
    return loadValidationRoute({
      ...options,
      route,
      current: () => options.isCurrent(token),
      focus: controlId => {
        options.pendingFocus.value = controlId;
      },
    });
  };
}
