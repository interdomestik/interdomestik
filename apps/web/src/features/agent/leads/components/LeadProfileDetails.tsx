import { useTranslations } from 'next-intl';

export type LeadProfile = {
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  branchId?: string | null;
  branch?: { name?: string | null } | null;
  leadKind?: string | null;
  companyName?: string | null;
  teamSize?: string | null;
};

function Detail({
  label,
  value,
  testId,
}: Readonly<{ label: string; value: string; testId?: string }>) {
  return (
    <div data-testid={testId}>
      <span className="block text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Contact and company facts of a lead; company fields live in their own columns since ACQ-1b. */
export function LeadProfileDetails({ lead }: Readonly<{ lead: LeadProfile }>) {
  const t = useTranslations('agent.leads_pro.fields');
  const isCompany = lead.leadKind === 'company' || Boolean(lead.companyName);
  return (
    <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
      {isCompany && (
        <Detail label={t('company')} value={lead.companyName || '-'} testId="lead-detail-company" />
      )}
      {isCompany && (
        <Detail
          label={t('team_size')}
          value={lead.teamSize || '-'}
          testId="lead-detail-team-size"
        />
      )}
      <Detail label={t('email')} value={lead.email || '-'} />
      <Detail label={t('phone')} value={lead.phone || '-'} />
      <Detail label={t('source')} value={lead.source || '-'} />
      <Detail label={t('branch')} value={lead.branch?.name || lead.branchId || '-'} />
    </div>
  );
}
