import 'server-only';

import type { RestrictedRead } from './get-claim-message-metadata';
import type { NoteFreeStatusEntry } from './get-note-free-claim-timeline';
import { NoteFreeStatusTimeline } from './note-free-status-timeline';
import { RestrictedCommunicationNotice } from './restricted-communication-notice';

/** Shared restricted rendering; each caller admits the trusted authority before reading. */
export function RestrictedClaimTimeline({
  result,
}: Readonly<{
  result: RestrictedRead<NoteFreeStatusEntry[]>;
}>): React.JSX.Element {
  let state: 'empty' | 'unavailable' | 'failed' | undefined;
  if (result.kind !== 'ok') state = result.kind;
  else if (result.data.length === 0) state = 'empty';
  return (
    <div className="space-y-3" data-testid="claim-note-free-timeline">
      <RestrictedCommunicationNotice state={state} />
      {result.kind === 'ok' && <NoteFreeStatusTimeline entries={result.data} />}
    </div>
  );
}
