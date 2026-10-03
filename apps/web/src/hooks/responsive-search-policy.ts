import { LOCALES } from '@/i18n/locales';

// Pure policy half of the shared responsive search: constants, contracts,
// param rules, route identity and the ui reducer. The hook keeps the side
// effecting half (timers, echo ownership, recovery) so both parts stay
// reviewable on their own. Nothing here touches the router or any data.

export const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;
export const SEARCH_COMMIT_DELAY_MS = 250;

export type SearchPendingKind = 'filter' | 'search';

export type SearchParamUpdates = Record<string, string | null>;

export type ResponsiveSearchAdapter = {
  /** Committed query params, as exposed by the router. */
  searchParams: URLSearchParams;
  /** Query param carrying the search term for this family. */
  searchKey: string;
  /** Starts the real navigation for a committed query string (no leading '?'). */
  navigate: (query: string) => void;
  /** Route identity used for echo ownership. */
  pathname?: string;
  /** Draft seed when a server component already resolved the term. */
  initialDraft?: string;
  /** Draft to committed term mapping, e.g. trimming. */
  normalizeTerm?: (draft: string) => string;
  /** Adapter param policy (page reset, sentinels, ...). Defaults to applyQueryUpdates. */
  buildQuery?: (currentParams: URLSearchParams, updates: SearchParamUpdates) => string;
  delayMs?: number;
  pendingTimeoutMs?: number;
};

export type ResponsiveSearch = {
  /** Raw draft text; may differ from the normalized committed term while editing. */
  draft: string;
  pendingKind: SearchPendingKind | null;
  isNavigationPending: boolean;
  editDraft: (value: string) => void;
  /** Adapter filter navigation sharing this hook's ownership and feedback. */
  requestNavigation: (updates: SearchParamUpdates, kind: SearchPendingKind) => boolean;
  /** Explicit cancellation for programmatic adapter navigation. */
  cancelScheduledSearch: (nextPendingKind?: SearchPendingKind | null) => void;
  /** Synchronous pending read for adapter guards inside one event. */
  getPendingKind: () => SearchPendingKind | null;
};

/** Default param policy: write non-empty values, delete empty or null ones. */
export function applyQueryUpdates(
  currentParams: URLSearchParams,
  updates: SearchParamUpdates
): string {
  const params = new URLSearchParams(currentParams.toString());

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === '') {
      params.delete(key);
      return;
    }

    params.set(key, value);
  });

  return params.toString();
}

// Canonical locale convention only, no routing or proxy behaviour: next-intl
// exposes locale free pathnames while window.location keeps the prefix, so
// '/sq/agent/members' and '/agent/members' are the same route and must not
// look like a navigation to the echo bookkeeping.
export function normalizeRoutePath(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const [, first, ...rest] = path.split('/');

  if (!first || !(LOCALES as readonly string[]).includes(first)) {
    return path;
  }

  const remainder = rest.join('/');
  return remainder ? `/${remainder}` : '/';
}

/** Route identity used for echo ownership: canonical path plus query. */
export function routeKey(pathname: string, query: string): string {
  return `${normalizeRoutePath(pathname)}?${query}`;
}

// A committed url always wins over a server resolved draft seed, on mount as
// well as on adoption. The seed only survives while this family has no
// committed term at all.
export function resolveInitialDraft(
  searchParams: URLSearchParams,
  searchKey: string,
  initialDraft?: string
): string {
  const committed = searchParams.get(searchKey);

  if (committed !== null) {
    return committed;
  }

  return initialDraft ?? '';
}

export type SearchUiState = {
  pendingKind: SearchPendingKind | null;
  /** Bumped by every new pending owner so recovery restarts for it. */
  pendingEpoch: number;
  draft: string;
};

export type SearchUiAction =
  | {
      type: 'pending-changed';
      pendingKind: SearchPendingKind | null;
      renew?: boolean;
      /** Owner id claimed synchronously by the caller, when it tracks one. */
      epoch?: number;
    }
  | { type: 'draft-edited'; draft: string };

export function searchUiReducer(state: SearchUiState, action: SearchUiAction): SearchUiState {
  switch (action.type) {
    case 'pending-changed': {
      const isSameKind = state.pendingKind === action.pendingKind;
      // A newer navigation of the same kind is still a new owner: renew the
      // epoch so the previous recovery timeout cannot clear its feedback.
      if (isSameKind && !(action.renew && action.pendingKind !== null)) {
        return state;
      }
      // The owner id is authoritative when the caller claimed one, so the
      // rendered epoch matches the id a queued recovery callback compares.
      const pendingEpoch = action.epoch ?? state.pendingEpoch + 1;
      return { ...state, pendingKind: action.pendingKind, pendingEpoch };
    }
    case 'draft-edited':
      if (state.draft === action.draft) {
        return state;
      }
      return { ...state, draft: action.draft };
  }
}
