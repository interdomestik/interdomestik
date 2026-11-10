import {
  acceptSupportHandoff,
  closeSupportHandoff,
  reassignSupportHandoff,
} from '@/actions/support-handoffs/lifecycle';
import { Button } from '@interdomestik/ui';
import type { ContentTranslations } from './staff-handoff-content-model';
import type { ContentRowProps } from './staff-handoff-content-row';

export function StaffHandoffContentActions({
  handoff,
  staffId,
  viewerRole,
  staffOptions,
  t,
}: Pick<ContentRowProps, 'handoff' | 'staffId' | 'viewerRole' | 'staffOptions' | 't'>) {
  return (
    <div className="space-y-3 text-right">
      {viewerRole === 'staff' && handoff.status === 'open' ? (
        <form action={acceptSupportHandoff} data-testid="staff-support-handoff-accept-form">
          <input type="hidden" name="handoffId" value={handoff.id} />
          <input type="hidden" name="expectedVersion" value={handoff.lifecycleVersion} />
          <Button type="submit" size="sm" data-testid="staff-support-handoff-accept">
            {t('actions.accept')}
          </Button>
        </form>
      ) : null}
      {viewerRole === 'staff' && handoff.status === 'accepted' && handoff.staffId === staffId ? (
        <form
          action={reassignSupportHandoff}
          className="space-y-2"
          data-testid="staff-support-handoff-reassign-form"
        >
          <input type="hidden" name="handoffId" value={handoff.id} />
          <input type="hidden" name="expectedVersion" value={handoff.lifecycleVersion} />
          <select
            name="nextStaffId"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            defaultValue={handoff.staffId ?? staffId}
            data-testid="staff-support-handoff-reassign-staff"
          >
            {staffOptions
              .filter(staff => staff.role === 'staff')
              .map(staff => (
                <option key={staff.id} value={staff.id}>
                  {staff.name || staff.email}
                </option>
              ))}
          </select>
          <input
            name="reason"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            placeholder={t('actions.reassign_reason')}
            required
            data-testid="staff-support-handoff-reassign-reason"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            data-testid="staff-support-handoff-reassign"
          >
            {t('actions.reassign')}
          </Button>
        </form>
      ) : null}
      {viewerRole === 'staff' && handoff.status === 'accepted' && handoff.staffId === staffId ? (
        <form
          action={closeSupportHandoff}
          className="space-y-2"
          data-testid="staff-support-handoff-close-form"
        >
          <input type="hidden" name="handoffId" value={handoff.id} />
          <input type="hidden" name="expectedVersion" value={handoff.lifecycleVersion} />
          <input
            name="reason"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            placeholder={t('actions.close_reason')}
            required
            data-testid="staff-support-handoff-close-reason"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            data-testid="staff-support-handoff-close"
          >
            {t('actions.close')}
          </Button>
        </form>
      ) : null}
      {viewerRole === 'branch_manager' ? (
        <span
          className="text-xs font-medium text-muted-foreground"
          data-testid="staff-support-handoff-readonly"
        >
          {t('actions.readonly')}
        </span>
      ) : null}
    </div>
  );
}
