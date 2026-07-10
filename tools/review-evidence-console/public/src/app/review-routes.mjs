import { createReceiptStore } from '../state/receipt-store.mjs';
import { verifyReceipt } from '../state/receipt-builder.mjs';
import { exportReceipt } from './receipt-io.mjs';
import { importReceipt as importLocalReceipt } from './import-controller.mjs';
import { startCorrection } from './correction-controller.mjs';
import { loadValidationRoute } from './validation-route.mjs';
import { awaitCurrent } from './current-async.mjs';
import { renderJsonFallback } from './result-fallback.mjs';
import { renderReceipt } from '../views/receipt.mjs';
import { renderCorrection } from '../views/correction.mjs';

export function createReviewRouteLoaders({ repository, render, navigate, isCurrent }) {
  const receiptStore = createReceiptStore({ verifyReceipt, schemaVersion: 1 });
  let pendingFocus = null;
  const imported = new Set();

  async function validation(route, token) {
    if (!isCurrent(token)) return;
    return loadValidationRoute({
      route,
      repository,
      receiptStore,
      render,
      navigate,
      current: () => isCurrent(token),
      focus: controlId => {
        pendingFocus = controlId;
      },
    });
  }

  async function receipt(route, token) {
    const loaded = await receiptStore.load(route.receiptId);
    if (!isCurrent(token)) return;
    if (!loaded.ok) return navigate({ name: 'inbox' });
    let fallback = null;
    let correcting = false;
    let correctionError = '';
    const correction = { itemId: '', reason: '', impact: '' };
    const current = () => isCurrent(token);
    const draw = () =>
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
              fallback = completed.value;
              draw();
            },
            onClear: id => {
              if (confirm(`Clear receipt ${id}? Drafts will remain.`)) {
                receiptStore.remove(id);
                navigate({ name: 'inbox' });
              }
            },
            onCorrect: () => {
              correcting = true;
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
        ],
        loaded.value.reviewerDisplayName
      );
    draw();
  }

  async function importReceipt(assignmentId, file, token) {
    const current = () => token === undefined || isCurrent(token);
    const completed = await awaitCurrent(
      importLocalReceipt({ assignmentId, file, repository, receiptStore }),
      current
    );
    if (!completed.ok) return completed;
    const result = completed.value;
    if (result.ok) {
      imported.add(result.value.receiptId);
      navigate({ name: 'receipt', receiptId: result.value.receiptId });
    }
    return result;
  }

  return {
    validation,
    receipt,
    importReceipt,
    receiptStore,
    takePendingFocus: () => {
      const value = pendingFocus;
      pendingFocus = null;
      return value;
    },
  };
}
