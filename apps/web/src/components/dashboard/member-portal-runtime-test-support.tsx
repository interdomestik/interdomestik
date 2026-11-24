import type { CaseSummary, MembershipLifecycleBucket } from '@interdomestik/domain-member';
import type { MemberPortalCopy } from './member-portal-runtime';

export const summaries = JSON.parse(
  '[{"caseKind":"accident","id":"claim-1","reference":"CLM-001","status":"submitted","documentCount":2,"nextStep":"team_review","occurredAt":"2026-08-29T10:00:00.000Z"},{"caseKind":"generic","id":"claim-2","title":"Property damage case","reference":null,"status":"draft","documentCount":0,"nextStep":"member_action","occurredAt":null}]'
) as CaseSummary[];
export const buckets =
  'none active trialing active_in_grace grace_expired scheduled_cancel canceled'.split(
    ' '
  ) as MembershipLifecycleBucket[];

const actions = Object.fromEntries(
  buckets.map(bucket => [
    bucket,
    {
      description: `Description ${bucket}`,
      label: `Action ${bucket}`,
      warning:
        bucket.includes('grace') || bucket === 'scheduled_cancel' ? `Warning ${bucket}` : null,
    },
  ])
) as MemberPortalCopy['actions'];

export const copy: MemberPortalCopy = {
  ...JSON.parse(
    '{"description":"Safe portal description","disclaimer":"No outcome is promised.","navigation":{"cases":"Cases","documents":"Docs","helpNow":"Help","label":"Shortcuts","membership":"Membership"},"referenceFallback":"Reference unavailable","regions":{"actions":{"empty":"None","error":"Actions unavailable","label":"Actions","loading":"Loading actions"},"case":{"empty":"No cases yet","error":"Case unavailable","label":"Case","loading":"Loading case"},"updates":{"empty":"No updates yet","error":"Updates unavailable","label":"Recent case updates","loading":"Loading updates"}},"title":"My cases"}'
  ),
  actions,
  caseEntryLabel: 'View case',
  caseLabels: summary => ({
    documentCount: 'Documents',
    nextStep: 'Next step',
    nextStepValue: summary.nextStep === 'team_review' ? 'Team review' : 'Member action',
    reference: 'Case reference',
    referenceFallback: 'Reference unavailable',
    status: 'Status',
    statusValue: summary.status === 'submitted' ? 'Submitted' : 'Draft',
  }),
  membershipStatus: {
    accessAllowed: 'Available',
    accessDenied: 'Not available',
    accessLabel: 'New-case access',
    currentPeriodEndLabel: 'Current period ends',
    retry: 'Try again',
    statusLabel: 'Membership status',
    statuses: Object.fromEntries(buckets.map(bucket => [bucket, `Status ${bucket}`])) as Record<
      MembershipLifecycleBucket,
      string
    >,
    unavailable: 'Not available',
  },
  status: value => (value === 'submitted' ? 'Submitted' : 'Draft'),
  updates_item: { occurred: 'Incident date', current_status: 'Current status' },
};
