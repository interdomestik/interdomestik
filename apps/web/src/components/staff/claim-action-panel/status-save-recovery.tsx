'use client';

import { Button } from '@interdomestik/ui';
import { usePathname } from 'next/navigation';
import { useClaimActionPanel } from './context';

export function StatusSaveRecovery({
  onHistoryChecked,
}: Readonly<{ onHistoryChecked: () => void }>) {
  const pathname = usePathname();
  const { t } = useClaimActionPanel();
  return (
    <div
      role="alert"
      className="space-y-3 rounded-md border p-3"
      data-testid="staff-status-save-recovery"
    >
      <p className="text-sm">{t('staff_actions.status_update.check_history_hint')}</p>
      <a
        href={`${pathname}#staff-status-history`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm underline"
        data-testid="staff-check-status-history"
      >
        {t('staff_actions.status_update.open_history')}
      </a>
      <Button
        type="button"
        variant="outline"
        onClick={onHistoryChecked}
        data-testid="staff-status-history-checked"
      >
        {t('staff_actions.status_update.history_checked')}
      </Button>
    </div>
  );
}
