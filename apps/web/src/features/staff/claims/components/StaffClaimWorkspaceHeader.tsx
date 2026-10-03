import Link from 'next/link';

export type StaffClaimSectionLink = Readonly<{
  id: string;
  label: string;
}>;

/**
 * Presentational case identity + section destinations for the mounted staff claim route.
 * Callers decide which sections are permitted and rendered; this header only links to them.
 */
export function StaffClaimWorkspaceHeader({
  backHref,
  backLabel,
  caseReference,
  navLabel,
  referenceLabel,
  sections,
  statusLabel,
}: Readonly<{
  backHref: string;
  backLabel: string;
  caseReference: string;
  navLabel: string;
  referenceLabel: string;
  sections: readonly StaffClaimSectionLink[];
  statusLabel: string;
}>) {
  return (
    <header className="space-y-4" data-testid="staff-claim-workspace-header">
      <Link
        className="inline-block max-w-full break-words text-sm font-medium text-muted-foreground underline underline-offset-4 motion-safe:transition-colors hover:text-slate-900"
        data-testid="staff-claim-workspace-back"
        href={backHref}
      >
        {backLabel}
      </Link>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {referenceLabel}
        </p>
        <h1
          className="break-words text-3xl font-bold tracking-tight"
          data-testid="staff-claim-workspace-reference"
        >
          {caseReference}
        </h1>
        <p className="text-muted-foreground">{statusLabel}</p>
      </div>
      {sections.length ? (
        <nav aria-label={navLabel} data-testid="staff-claim-workspace-nav">
          <ul className="flex flex-wrap gap-2">
            {sections.map(section => (
              <li className="max-w-full" key={section.id}>
                <a
                  className="inline-block max-w-full break-words rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-900 motion-safe:transition-colors hover:bg-slate-50"
                  data-section={section.id}
                  data-testid="staff-claim-workspace-nav-link"
                  href={`#${section.id}`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
