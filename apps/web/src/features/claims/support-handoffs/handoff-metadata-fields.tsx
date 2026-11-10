import type { HandoffMetadata } from './get-handoff-metadata';

export type MetadataLabels = Record<
  | 'status'
  | 'branch'
  | 'assignee'
  | 'createdAt'
  | 'updatedAt'
  | 'acceptedAt'
  | 'reassignedAt'
  | 'closedAt'
  | 'publicResponseAt'
  | 'publicResponseCount'
  | 'memberReplyAt',
  string
>;

export function HandoffMetadataFields({
  data,
  labels,
  locale,
  missing,
  statuses,
}: {
  data: HandoffMetadata;
  labels: MetadataLabels;
  locale: string;
  missing: { timestamp: string; assignee: string; branch: string };
  statuses: Record<string, string>;
}) {
  const fields = {
    status: statuses[data.status],
    branch: data.branchName,
    assignee: data.staffName,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    acceptedAt: data.acceptedAt,
    reassignedAt: data.reassignedAt,
    closedAt: data.closedAt,
    publicResponseAt: data.publicResponseAt,
    publicResponseCount: data.publicResponseCount,
    memberReplyAt: data.memberReplyAt,
  };
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(fields).map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs text-muted-foreground">{labels[key as keyof MetadataLabels]}</dt>
          <dd className="break-words text-sm" data-testid={`handoff-metadata-${key}`}>
            {key.endsWith('At') && typeof value === 'string'
              ? new Date(value).toLocaleString(locale, { timeZone: 'UTC' })
              : (value ??
                (key === 'assignee'
                  ? missing.assignee
                  : key === 'branch'
                    ? missing.branch
                    : missing.timestamp))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
