import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import type { ContentPresentation, ContentTranslations } from './staff-handoff-content-model';

export function StaffHandoffContentFilters({
  locale,
  t,
  presentation,
}: {
  locale: string;
  t: ContentTranslations;
  presentation: ContentPresentation;
}) {
  const {
    hiddenFields,
    currentSearch,
    assignmentOptions,
    statusOptions,
    urgencyOptions,
    claimOptions,
    attentionOptions,
  } = presentation;
  return (
    <div
      className="rounded-lg border bg-white p-4 shadow-sm"
      data-testid="staff-support-handoffs-filters"
    >
      <form
        action={`/${locale}/staff/support-handoffs`}
        className="flex flex-col gap-3 md:flex-row"
        data-testid="staff-support-handoffs-search-form"
      >
        {hiddenFields.map(field => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
        <input
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          name="search"
          defaultValue={currentSearch ?? ''}
          placeholder={t('filters.search_placeholder')}
          data-testid="staff-support-handoffs-search-input"
        />
        <Button type="submit" variant="outline" data-testid="staff-support-handoffs-search-submit">
          {t('filters.search')}
        </Button>
      </form>
      <div className="mt-4 grid gap-3 md:grid-cols-5">
        {[
          {
            label: t('filters.assignment.label'),
            options: assignmentOptions,
            testId: 'staff-support-handoffs-assignment-filters',
          },
          {
            label: t('filters.status.label'),
            options: statusOptions,
            testId: 'staff-support-handoffs-status-filters',
          },
          {
            label: t('filters.urgency.label'),
            options: urgencyOptions,
            testId: 'staff-support-handoffs-urgency-filters',
          },
          {
            label: t('filters.claim.label'),
            options: claimOptions,
            testId: 'staff-support-handoffs-claim-filters',
          },
          {
            label: t('filters.attention.label'),
            options: attentionOptions,
            testId: 'staff-support-handoffs-attention-filters',
          },
        ].map(group => (
          <div key={group.testId} className="space-y-2" data-testid={group.testId}>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.options.map(option => (
                <Button
                  key={option.value}
                  asChild
                  size="sm"
                  variant={option.isActive ? 'default' : 'outline'}
                  data-testid={option.testId}
                >
                  <Link href={option.href}>{option.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
