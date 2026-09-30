import { LatestStatusNoteContent } from './LatestStatusNoteContent';

type PublicStatusEntry = Readonly<{
  id: string;
  note: string | null;
  toStatus: string | null;
  createdAt: Date | null;
}>;

export function StaffStatusHistory({
  statusHistory,
  locale,
  latestTitle,
  emptyLabel,
  historyTitle,
  statusLabel,
}: Readonly<{
  statusHistory: readonly PublicStatusEntry[];
  locale: string;
  latestTitle: string;
  emptyLabel: string;
  historyTitle: string;
  statusLabel: (status: string | null) => string;
}>) {
  const latestStatusNote = statusHistory.find(entry => entry.note !== null) ?? null;
  return (
    <>
      <section className="rounded-lg border bg-white p-4" data-testid="staff-claim-detail-note">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {latestTitle}
        </h2>
        <div className="mt-3 space-y-1 text-sm">
          <LatestStatusNoteContent
            latestStatusNote={latestStatusNote}
            emptyLabel={emptyLabel}
            locale={locale}
          />
        </div>
      </section>

      <section
        id="staff-status-history"
        className="rounded-lg border bg-white p-4"
        data-testid="staff-status-history"
        aria-labelledby="staff-status-history-title"
      >
        <h2 id="staff-status-history-title" className="text-sm font-semibold">
          {historyTitle}
        </h2>
        <ol className="mt-3 space-y-3">
          {statusHistory.map(entry => (
            <li key={entry.id} className="border-t pt-3" data-testid="staff-status-history-entry">
              <p className="font-medium">{statusLabel(entry.toStatus)}</p>
              {entry.note ? <p className="whitespace-pre-wrap break-words">{entry.note}</p> : null}
              {entry.createdAt ? (
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={entry.createdAt.toISOString()}
                >
                  {entry.createdAt.toLocaleString(locale)}
                </time>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
