import 'server-only';

import type { RestrictedRead } from './get-claim-message-metadata';
import type { NoteFreeStatusEntry } from './get-note-free-claim-timeline';
import { NoteFreeStatusTimeline } from './note-free-status-timeline';
import { RestrictedCommunicationNotice } from './restricted-communication-notice';

/** Shared restricted rendering; each caller admits the trusted authority before reading. */
export function RestrictedClaimTimeline({
  result,
}: {
  result: RestrictedRead<NoteFreeStatusEntry[]>;
}): React.JSX.Element {
  return (
    <div className="space-y-3" data-testid="claim-note-free-timeline">
      <RestrictedCommunicationNotice
        state={result.kind !== 'ok' ? result.kind : result.data.length === 0 ? 'empty' : undefined}
      />
      {result.kind === 'ok' && <NoteFreeStatusTimeline entries={result.data} />}
    </div>
  );
}
