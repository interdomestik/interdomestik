import { renderJsonFallback } from './result-fallback.mjs';
import { renderReceipt } from '../views/receipt.mjs';
import { renderCorrection } from '../views/correction.mjs';

export function renderReceiptView({
  receipt,
  packet,
  importNotice,
  backLabel,
  onBack,
  onSaveDirectory,
  directoryResult,
  onExport,
  onClear,
  onCorrect,
  correcting,
  correction,
  correctionError,
  itemIds,
  onCorrectionChange,
  onCorrectionSubmit,
  fallback,
  onCopyFallback,
  routeError,
}) {
  return [
    renderReceipt({
      receipt,
      packet,
      importNotice,
      backLabel,
      onBack,
      onSaveDirectory,
      directoryResult,
      onExport,
      onClear,
      onCorrect,
    }),
    correcting
      ? renderCorrection({
          receipt,
          itemIds,
          values: correction,
          error: correctionError,
          onChange: onCorrectionChange,
          onSubmit: onCorrectionSubmit,
        })
      : null,
    fallback?.text ? renderJsonFallback(fallback, onCopyFallback) : null,
    routeError ? renderJsonFallback(routeError) : null,
  ];
}
