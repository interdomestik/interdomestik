export type StaffClaimContextField = Readonly<{
  label: string;
  testId?: string;
  value: string;
}>;

export type StaffClaimContextGroup = Readonly<{
  columns?: string;
  fields?: readonly StaffClaimContextField[];
  note?: Readonly<{ muted?: boolean; testId?: string; value: string }>;
  testId: string;
  title: string;
}>;

const GROUP_HEADING = 'text-sm font-semibold uppercase tracking-wide text-muted-foreground';

/** Secondary, read-only case context for the mounted staff claim route. Presentational only. */
export function StaffClaimContext({
  groups,
  sectionId,
  title,
}: Readonly<{
  groups: readonly (StaffClaimContextGroup | null)[];
  sectionId: string;
  title: string;
}>) {
  return (
    <section
      aria-labelledby={`${sectionId}-title`}
      className="space-y-4"
      data-testid="staff-claim-context"
      id={sectionId}
    >
      <h2 className={GROUP_HEADING} id={`${sectionId}-title`}>
        {title}
      </h2>
      {groups.map(group =>
        group ? (
          <section
            className="rounded-lg border bg-white p-4"
            data-testid={group.testId}
            key={group.testId}
          >
            <h3 className={GROUP_HEADING}>{group.title}</h3>
            {group.fields?.length ? (
              <dl
                className={`mt-3 grid grid-cols-1 gap-2 text-sm ${group.columns ?? 'md:grid-cols-2'}`}
              >
                {group.fields.map(field => (
                  <div key={field.label}>
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd
                      className="break-words font-medium text-slate-900"
                      data-testid={field.testId}
                    >
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {group.note ? (
              <p
                className={`mt-3 text-sm ${group.note.muted ? 'text-muted-foreground' : 'font-medium text-slate-900'}`}
                data-testid={group.note.testId}
              >
                {group.note.value}
              </p>
            ) : null}
          </section>
        ) : null
      )}
    </section>
  );
}
