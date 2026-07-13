import { loadHistoryRows } from '../views/history-data.mjs';
import { renderHistory } from '../views/history.mjs';

export function createHistoryRoute({
  repository,
  receiptStore,
  render,
  navigate,
  isCurrent,
  onSessionExpired,
}) {
  return async function history(_route, token) {
    render(renderHistory({ state: 'loading' }), 'Historia e shqyrtimeve');
    const result = await loadHistoryRows(repository, receiptStore);
    if (!isCurrent(token)) return;
    if (!result.ok) {
      if (result.code === 'session_expired') return onSessionExpired();
      return render(
        renderHistory({ state: 'unavailable', message: result.message }),
        'Historia e shqyrtimeve',
        'history-title'
      );
    }
    render(
      renderHistory({
        state: result.value.length ? 'populated' : 'empty',
        rows: result.value,
        onOpenReceipt: receiptId => navigate({ name: 'receipt', receiptId }),
        onRequestChange: receiptId => navigate({ name: 'receipt', receiptId, correcting: true }),
      }),
      result.reviewer.role,
      'history-title'
    );
  };
}
