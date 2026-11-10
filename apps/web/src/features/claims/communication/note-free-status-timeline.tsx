import { getFormatter, getTranslations } from 'next-intl/server';
import type { NoteFreeStatusEntry } from './get-note-free-claim-timeline';

/** Status and time only: no invented actor attribution and no note-bearing props. */
export async function NoteFreeStatusTimeline({
  entries,
}: {
  entries: readonly NoteFreeStatusEntry[];
}) {
  const t = await getTranslations('claims-tracking.status');
  const format = await getFormatter();
  return (
    <ol className="space-y-3" data-testid="claim-note-free-status-entries">
      {entries.map(entry => (
        <li key={entry.id} className="border-t pt-3">
          <p className="font-medium">{t(entry.toStatus)}</p>
          {entry.timestamp && (
            <time
              dateTime={entry.timestamp.toISOString()}
              className="text-sm text-muted-foreground"
            >
              {format.dateTime(entry.timestamp, { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
          )}
        </li>
      ))}
    </ol>
  );
}
