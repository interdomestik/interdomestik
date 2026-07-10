import { createReceiptStore } from '../state/receipt-store.mjs';
import { verifyReceipt } from '../state/receipt-builder.mjs';
import { exportReceipt } from './receipt-io.mjs';
import { startCorrection } from './correction-controller.mjs';
import { createValidationHandler } from './validation-route.mjs';
import { awaitCurrent, takeValue } from './current-async.mjs';
import { clearReceipt, createImportHandler } from './receipt-route-actions.mjs';
import { renderJsonFallback } from './result-fallback.mjs';
import { renderReceipt } from '../views/receipt.mjs';
import { renderCorrection } from '../views/correction.mjs';

export function createReviewRouteLoaders({ repository, render, navigate, isCurrent }) {
  const receiptStore = createReceiptStore({ verifyReceipt, schemaVersion: 1 });
  const pendingFocus = { value: null };
  const imported = new Set();

  const validation = createValidationHandler({
    repository,
    receiptStore,
    render,
    navigate,
    isCurrent,
    pendingFocus,
  });

  async function receipt(route, token) {
    const loaded = await receiptStore.load(route.receiptId);
    if (!isCurrent(token)) return;
    if (!loaded.ok) return navigate({ name: 'inbox' });
    let fallback = null;
    let correcting = false;
    let correctionError = '';
    const correction = { itemId: '', reason: '', impact: '' };
    const current = () => isCurrent(token);
    let focusId = 'receipt-heading';
    let routeError = null;
    const draw = () => {
      const nextFocus = focusId;
      focusId = null;
      render(
        [
          renderReceipt({
            receipt: loaded.value,
            importNotice: imported.has(route.receiptId)
              ? 'Read on this device; never uploaded'
              : '',
            onExport: async () => {
              const completed = await awaitCurrent(
                exportReceipt(route.receiptId, receiptStore),
                current
              );
              if (!completed.ok) return;
              if (completed.value.code === 'download_failed') fallback = completed.value;
              else if (!completed.value.ok) routeError = completed.value;
              draw();
            },
            onClear: id => {
              if (confirm(`Clear receipt ${id}? Drafts will remain.`)) {
                clearReceipt({
                  id,
                  store: receiptStore,
                  current,
                  navigate,
                  onError: error => {
                    routeError = error;
                    draw();
                  },
                });
              }
            },
            onCorrect: () => {
              correcting = true;
              focusId = 'correction-heading';
              draw();
            },
          }),
          correcting
            ? renderCorrection({
                receipt: loaded.value,
                itemIds: Object.keys(loaded.value.decisions),
                values: correction,
                error: correctionError,
                onChange: (key, value) => {
                  correction[key] = value;
                },
                onSubmit: async () => {
                  const bundleDone = await awaitCurrent(
                    repository.loadAssignmentBundle(loaded.value.assignmentId),
                    current
                  );
                  if (!bundleDone.ok) return;
                  const bundle = bundleDone.value;
                  const correctionDone = bundle.ok
                    ? await awaitCurrent(
                        startCorrection({
                          bundle: bundle.value,
                          receipt: loaded.value,
                          metadata: correction,
                        }),
                        current
                      )
                    : { ok: true, value: bundle };
                  if (!correctionDone.ok) return;
                  const result = correctionDone.value;
                  if (!result.ok) {
                    correctionError = result.message;
                    return draw();
                  }
                  navigate({
                    name: 'workspace',
                    assignmentId: loaded.value.assignmentId,
                    itemId: result.itemId,
                  });
                },
              })
            : null,
          fallback?.text
            ? renderJsonFallback(fallback, async () => {
                const completed = await awaitCurrent(fallback.copy(), current);
                if (!completed.ok) return;
                const copied = completed.value;
                fallback = { ...fallback, message: copied.message };
                draw();
              })
            : null,
          routeError ? renderJsonFallback(routeError) : null,
        ],
        loaded.value.reviewerDisplayName,
        nextFocus
      );
    };
    draw();
  }

  const importReceipt = createImportHandler({
    repository,
    receiptStore,
    imported,
    navigate,
    isCurrent,
  });

  return {
    validation,
    receipt,
    importReceipt,
    receiptStore,
    takePendingFocus: () => takeValue(pendingFocus),
  };
}
