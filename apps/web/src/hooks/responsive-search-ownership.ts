import type { SearchPendingKind } from './responsive-search-policy';

// Mutable ownership half of the shared responsive search: who owns the url
// right now, which committed urls we are still awaiting an echo for, and the
// single queued draft commit timer.
//
// Deliberately React free. The hook keeps one instance in a ref, so taking or
// dropping ownership happens synchronously inside the event that caused it and
// never waits for a render or for React to reconnect an effect cleanup. Two
// independent guards live here:
//
//   generation - intent id. A queued commit callback compares it and refuses to
//                commit superseded work; an issued navigation records it so a
//                late echo can tell whether its intent is still the latest one.
//                Only accepted edits and navigations bump it, never recovery.
//   owner      - a queued pending feedback recovery callback compares it and
//                refuses to clear feedback that a newer navigation owns.

type ScheduledCommit = {
  term: string;
  timer: ReturnType<typeof globalThis.setTimeout>;
};

type IssuedNavigation = {
  key: string;
  kind: SearchPendingKind;
  /** Intent generation this navigation was issued under. */
  intent: number;
};

export type SearchEcho = {
  kind: SearchPendingKind;
  /** False once a later accepted edit or navigation superseded this intent. */
  isCurrentIntent: boolean;
};

export type SearchOwnership = {
  /** Current pending feedback owner id. */
  owner: () => number;
  /** Takes ownership of the pending feedback and returns the new owner id. */
  claimOwner: () => number;
  /** Records a url we navigated to ourselves, awaiting its async echo. */
  issue: (key: string, kind: SearchPendingKind) => void;
  /** Kind of our own navigation this url echoes, dropping anything older. */
  takeEcho: (key: string) => SearchPendingKind | null;
  /** Same echo, plus whether the intent that issued it is still the latest. */
  takeEchoIntent: (key: string) => SearchEcho | null;
  awaitingEcho: () => boolean;
  forgetIssued: () => void;
  schedule: (term: string, delayMs: number, commit: (term: string) => void) => void;
  hasScheduled: () => boolean;
  clearScheduled: () => void;
  /** Lifecycle disconnect: abandon queued timers and echo ownership together. */
  abandon: () => void;
};

export function createSearchOwnership(): SearchOwnership {
  let generation = 0;
  let ownerId = 0;
  let scheduled: ScheduledCommit | null = null;
  const issued: IssuedNavigation[] = [];

  const clearScheduled = () => {
    generation += 1;

    if (scheduled) {
      globalThis.clearTimeout(scheduled.timer);
      scheduled = null;
    }
  };

  const forgetIssued = () => {
    issued.length = 0;
  };

  const takeEchoIntent = (key: string): SearchEcho | null => {
    let echoIndex = -1;

    for (let index = issued.length - 1; index >= 0; index -= 1) {
      if (issued[index].key === key) {
        echoIndex = index;
        break;
      }
    }

    if (echoIndex < 0) {
      return null;
    }

    const { kind, intent } = issued[echoIndex];
    // Out of order echoes: this one settles everything issued before it.
    issued.splice(0, echoIndex + 1);
    // Intent identity, not term or timer history: the generation only moves on
    // for an accepted edit or navigation, so an equal one means this echo is
    // still the latest user intent even if recovery released its feedback.
    return { kind, isCurrentIntent: intent === generation };
  };

  return {
    owner: () => ownerId,
    claimOwner: () => {
      ownerId += 1;
      return ownerId;
    },
    issue: (key, kind) => {
      issued.push({ key, kind, intent: generation });
    },
    takeEcho: key => takeEchoIntent(key)?.kind ?? null,
    takeEchoIntent,
    awaitingEcho: () => issued.length > 0,
    forgetIssued,
    schedule: (term, delayMs, commit) => {
      const scheduledGeneration = generation;
      const timer = globalThis.setTimeout(() => {
        // Generation check, not a timer check: ownership may have moved on.
        if (generation !== scheduledGeneration) {
          return;
        }

        scheduled = null;
        commit(term);
      }, delayMs);
      scheduled = { term, timer };
    },
    hasScheduled: () => scheduled !== null,
    clearScheduled,
    abandon: () => {
      clearScheduled();
      forgetIssued();
    },
  };
}
