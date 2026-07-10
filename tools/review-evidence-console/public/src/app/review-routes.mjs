import { createReceiptStore } from '../state/receipt-store.mjs';
import { verifyReceipt } from '../state/receipt-builder.mjs';
import { exportReceipt } from './receipt-io.mjs';
import { importReceipt as importLocalReceipt } from './import-controller.mjs';
import { startCorrection } from './correction-controller.mjs';
import { loadValidationRoute } from './validation-route.mjs';
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
    const draw = () =>
      render(
        [
          renderReceipt({
            receipt: loaded.value,
            importNotice: imported.has(route.receiptId)
              ? 'Read on this device; never uploaded'
              : '',
            onExport: async () => {
              fallback = await exportReceipt(route.receiptId, receiptStore);
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
                  const bundle = await repository.loadAssignmentBundle(loaded.value.assignmentId);
                  const result = bundle.ok
                    ? await startCorrection({
                        bundle: bundle.value,
                        receipt: loaded.value,
                        metadata: correction,
                      })
                    : bundle;
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
                const copied = await fallback.copy();
                fallback = { ...fallback, message: copied.message };
                draw();
              })
            : null,
        ],
        loaded.value.reviewerDisplayName
      );
    draw();
  }

  async function importReceipt(assignmentId, file) {
    const result = await importLocalReceipt({ assignmentId, file, repository, receiptStore });
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
