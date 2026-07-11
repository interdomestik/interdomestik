import { createReceiptStore } from '../state/receipt-store.mjs';
import { verifyReceipt } from '../state/receipt-builder.mjs';
import { createValidationHandler } from './validation-route.mjs';
import { takeValue } from './current-async.mjs';
import { createImportHandler } from './receipt-route-actions.mjs';
import { createReceiptDirectoryWriter } from './receipt-directory-writer.mjs';
import { createReceiptRoute } from './receipt-route.mjs';

export function createReviewRouteLoaders({
  repository,
  render,
  navigate,
  isCurrent,
  directoryWriter = createReceiptDirectoryWriter(),
}) {
  const receiptStore = createReceiptStore({ verifyReceipt, schemaVersion: 1 });
  const pendingFocus = { value: null };
  const imported = new Set();
  const shared = { repository, receiptStore, render, navigate, isCurrent };
  const validation = createValidationHandler({ ...shared, pendingFocus });
  const receipt = createReceiptRoute({ ...shared, imported, directoryWriter });
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
