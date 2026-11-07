import { Badge } from '@interdomestik/ui';
import { getFormatter, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/routing';

import type {
  DuplicateReferralRow,
  DuplicateReviewState,
} from '../server/list-duplicate-referrals';
import { ResolveDuplicateActions } from './ResolveDuplicateActions';

function LeadCell({
  lead,
  missing,
}: Readonly<{ lead: DuplicateReferralRow['lead']; missing: string }>) {
  if (!lead) return <span className="text-muted-foreground">{missing}</span>;
  return (
    <div>
      <p className="font-medium">{`${lead.firstName} ${lead.lastName}`.trim()}</p>
      <p className="text-xs text-muted-foreground">{lead.email}</p>
      {lead.ownerName ? <p className="text-xs text-muted-foreground">{lead.ownerName}</p> : null}
    </div>
  );
}

/** The reviewer list for possible-duplicate referrals (IDA-CRM-003); rows arrive already scoped. */
export async function LeadDuplicateReviewPanel({
  rows,
  state,
}: Readonly<{ rows: DuplicateReferralRow[]; state: DuplicateReviewState }>) {
  const t = await getTranslations('admin.leads.duplicates');
  const format = await getFormatter();

  return (
    <section data-testid="lead-duplicates-panel" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </div>
      <nav className="flex gap-4 text-sm" aria-label={t('tab')}>
        {(['pending', 'resolved'] as const).map(tab => (
          <Link
            key={tab}
            href={`/admin/leads?view=duplicates&state=${tab}`}
            aria-current={tab === state ? 'page' : undefined}
            data-testid={`lead-duplicates-tab-${tab}`}
            className={tab === state ? 'font-semibold underline' : 'text-muted-foreground'}
          >
            {t(`${tab}_tab`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p data-testid="lead-duplicates-empty" className="text-sm text-muted-foreground">
          {state === 'pending' ? t('empty') : t('resolved_empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4">{t('referred_at')}</th>
                <th className="py-2 pr-4">{t('existing_lead')}</th>
                <th className="py-2 pr-4">{t('lead_status')}</th>
                <th className="py-2 pr-4">{t('lead_branch')}</th>
                <th className="py-2 pr-4">{t('submitted_by')}</th>
                <th className="py-2">{t('state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.referralId}
                  data-testid={`lead-duplicate-${row.referralId}`}
                  className="border-b align-top"
                >
                  <td className="py-3 pr-4">
                    {row.referredAt ? format.dateTime(row.referredAt, { dateStyle: 'medium' }) : ''}
                  </td>
                  <td className="py-3 pr-4">
                    <LeadCell lead={row.lead} missing={t('lead_missing')} />
                  </td>
                  <td className="py-3 pr-4">
                    {row.lead ? <Badge variant="outline">{row.lead.status}</Badge> : null}
                  </td>
                  <td className="py-3 pr-4">{row.lead?.branchName ?? ''}</td>
                  <td className="py-3 pr-4">
                    <p>{row.submittingAgentName ?? ''}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.submittingBranchName ?? ''}
                    </p>
                  </td>
                  <td className="py-3">
                    {row.resolution ? (
                      <div>
                        <Badge variant="secondary">{t(`outcome_${row.resolution.outcome}`)}</Badge>
                        {row.resolution.resolverName ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('resolved_by', { name: row.resolution.resolverName })}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Badge>{t('state_pending')}</Badge>
                        <ResolveDuplicateActions referralId={row.referralId} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
