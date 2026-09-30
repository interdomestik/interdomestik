'use client';

import { useCallback, useEffect, useState } from 'react';
import { getUserChoices } from '@/actions/admin-users';
import { listBranches } from '@/actions/admin-rbac.core';
import { isPromotableToAgentRole } from './promotable-roles';

export type AddAgentOptionUser = {
  id: string;
  name: string | null;
  email: string;
};

export type AddAgentOptionBranch = {
  id: string;
  name: string;
};

export type AddAgentOptionsState =
  | { status: 'idle'; users: AddAgentOptionUser[]; branches: AddAgentOptionBranch[]; error: null }
  | {
      status: 'loading';
      users: AddAgentOptionUser[];
      branches: AddAgentOptionBranch[];
      error: null;
    }
  | { status: 'ready'; users: AddAgentOptionUser[]; branches: AddAgentOptionBranch[]; error: null }
  | {
      status: 'error';
      users: AddAgentOptionUser[];
      branches: AddAgentOptionBranch[];
      error: string;
    };

const IDLE_STATE: AddAgentOptionsState = { status: 'idle', users: [], branches: [], error: null };

// Server-side role filter mirrors isPromotableToAgentRole; client re-checks below
// in case an action changes its own filtering semantics.
const ELIGIBLE_ROLE_FILTER = 'user,member,staff';

function normalizeSearch(search: string | undefined): string | undefined {
  const trimmed = search?.trim();
  return trimmed ? trimmed : undefined;
}

export function useAddAgentOptions(
  open: boolean,
  search?: string
): AddAgentOptionsState & { retry: () => void } {
  const normalizedSearch = normalizeSearch(search);
  const [loaded, setLoaded] = useState({
    search: normalizedSearch,
    retryToken: 0,
    value: IDLE_STATE,
  });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const updateState = (value: AddAgentOptionsState) => {
      setLoaded({ search: normalizedSearch, retryToken, value });
    };
    if (!open) {
      updateState(IDLE_STATE);
      return;
    }

    let cancelled = false;
    updateState({ status: 'loading', users: [], branches: [], error: null });

    async function load() {
      try {
        const [usersResult, branchesResult] = await Promise.all([
          getUserChoices({
            search: normalizedSearch,
            role: ELIGIBLE_ROLE_FILTER,
            assignment: undefined,
          }),
          listBranches({ includeInactive: false }),
        ]);

        if (cancelled) return;

        if (!usersResult.success) {
          updateState({ status: 'error', users: [], branches: [], error: usersResult.error });
          return;
        }

        if (!branchesResult.success) {
          updateState({ status: 'error', users: [], branches: [], error: branchesResult.error });
          return;
        }

        const users = (usersResult.data ?? [])
          .filter(user => isPromotableToAgentRole(user.role))
          .map(user => ({ id: user.id, name: user.name, email: user.email }));

        const branches = (branchesResult.data ?? []).map(branch => ({
          id: branch.id,
          name: branch.name,
        }));

        updateState({ status: 'ready', users, branches, error: null });
      } catch {
        if (!cancelled) {
          updateState({ status: 'error', users: [], branches: [], error: 'unexpected' });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open, normalizedSearch, retryToken]);

  const retry = useCallback(() => {
    setRetryToken(token => token + 1);
  }, []);

  // Hide prior options during the render before the next effect starts its read.
  const state: AddAgentOptionsState = !open
    ? IDLE_STATE
    : loaded.search !== normalizedSearch ||
        loaded.retryToken !== retryToken ||
        loaded.value.status === 'idle'
      ? { status: 'loading', users: [], branches: [], error: null }
      : loaded.value;

  return { ...state, retry };
}
