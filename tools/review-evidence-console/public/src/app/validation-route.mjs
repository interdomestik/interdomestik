import { composeDraftKey, createDraftStore } from '../state/draft-store.mjs';
import { createReviewSession } from '../state/review-session.mjs';
import { createSubmissionController } from './submission-controller.mjs';
import { renderValidation } from '../views/validation.mjs';

export async function loadValidationRoute({
  route,
  repository,
  receiptStore,
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
    packetVersion: bundle.packet.version,
  });
  const stored = createDraftStore({ schemaVersion: 1 }).load(key);
  const draft = stored.ok ? stored.value : undefined;
  const session = createReviewSession(bundle, draft);
  const safe = draft?.safeEvidenceConfirmed === true;
  const controller = createSubmissionController({
    bundle,
    receiptStore,
    onNavigate: receiptId => navigate({ name: 'receipt', receiptId }),
    onStatus: () => draw(),
  });
  function draw() {
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
      bundle.reviewer.displayName
    );
  }
  draw();
}
