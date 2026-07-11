import { exportReceipt } from './receipt-io.mjs';
import { startCorrection } from './correction-controller.mjs';
import { awaitCurrent } from './current-async.mjs';
import { clearReceipt } from './receipt-route-actions.mjs';
import { confirmClearReceipt } from './receipt-confirmation.mjs';
import { renderReceiptView } from './receipt-view.mjs';
import { importedReceiptMatchesPacket } from './receipt-packet-guard.mjs';

export function createReceiptRoute(options) {
  const { repository, receiptStore, render, navigate, isCurrent, imported, directoryWriter } =
    options;
  return async function receipt(route, token) {
    const loaded = await receiptStore.load(route.receiptId);
    if (!isCurrent(token)) return;
    if (!loaded.ok) return navigate({ name: 'inbox' });
    const bundleDone = await repository.loadAssignmentBundle(loaded.value.assignmentId);
    if (!isCurrent(token)) return;
    if (!bundleDone.ok) return navigate({ name: 'inbox' });
    const bundle = bundleDone.value;
    if (
      bundle.packet.id !== loaded.value.packetId ||
      bundle.packet.version !== loaded.value.packetVersion ||
      !importedReceiptMatchesPacket(loaded.value, bundle.packet, imported.has(route.receiptId))
    )
      return navigate({ name: 'inbox' });
    let fallback = null;
    let directoryResult = null;
    let directorySavePending = false;
    let correcting = false;
    let correctionError = '';
    const correction = { itemId: '', reason: '', impact: '' };
    const current = () => isCurrent(token);
    let focusId = 'receipt-heading';
    let routeError = null;
    const onExport = async () => {
      const completed = await awaitCurrent(exportReceipt(route.receiptId, receiptStore), current);
      if (!completed.ok) return;
      if (completed.value.code === 'download_failed') fallback = completed.value;
      else if (!completed.value.ok) routeError = completed.value;
      draw();
    };
    const onSaveDirectory = async () => {
      if (directorySavePending) return;
      directorySavePending = true;
      const completed = await awaitCurrent(directoryWriter.save(loaded.value), current);
      directorySavePending = false;
      if (!completed.ok) return;
      directoryResult = completed.value;
      draw();
    };
    const onClear = id => {
      if (!confirmClearReceipt(id)) return;
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
    };
    const onCorrect = () => {
      correcting = true;
      focusId = 'correction-heading';
      draw();
    };
    const onCorrectionChange = (key, value) => {
      correction[key] = value;
    };
    const onCorrectionSubmit = async () => {
      const completed = await awaitCurrent(
        startCorrection({ bundle, receipt: loaded.value, metadata: correction }),
        current
      );
      if (!completed.ok) return;
      if (!completed.value.ok) {
        correctionError = completed.value.message;
        return draw();
      }
      navigate({
        name: 'workspace',
        assignmentId: loaded.value.assignmentId,
        itemId: completed.value.itemId,
      });
    };
    const onCopyFallback = async () => {
      const completed = await awaitCurrent(fallback.copy(), current);
      if (!completed.ok) return;
      fallback = { ...fallback, message: completed.value.message };
      draw();
    };
    const draw = () => {
      const nextFocus = focusId;
      focusId = null;
      render(
        renderReceiptView({
          receipt: loaded.value,
          packet: bundle.packet,
          importNotice: imported.has(route.receiptId)
            ? 'Lexohet në këtë pajisje; nuk ngarkohet kurrë'
            : '',
          backLabel:
            loaded.value.packetId === 'mob-03a-part-a'
              ? 'Kthehu te paketat — vazhdo me Pjesën B'
              : 'Kthehu te paketat',
          onBack: () => navigate({ name: 'inbox' }),
          onSaveDirectory: directoryWriter.supported ? onSaveDirectory : undefined,
          directoryResult,
          onExport,
          onClear,
          onCorrect,
          correcting,
          correction,
          correctionError,
          itemIds: Object.keys(loaded.value.decisions),
          onCorrectionChange,
          onCorrectionSubmit,
          fallback,
          onCopyFallback,
          routeError,
        }),
        loaded.value.reviewerDisplayName,
        nextFocus
      );
    };
    draw();
  };
}
