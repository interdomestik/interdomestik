'use client';
import { createContext, useContext } from 'react';

// Context identity and contract of the admin users responsive search. Kept
// apart from the provider so consumers depend on the contract only and the
// provider stays inside the review boundary. No behaviour lives here.

export type AdminUsersPendingKind = 'search' | 'role' | 'assignment';
export type AdminUsersFilterKey = 'role' | 'assignment';

export type AdminUsersSearchValue = {
  searchValue: string;
  setSearchValue: (value: string) => void;
  submitSearch: () => void;
  pendingKind: AdminUsersPendingKind | null;
  isNavigationPending: boolean;
  hasRetainedFilterTarget: (filter: AdminUsersFilterKey) => boolean;
  navigate: (href: string, kind: AdminUsersPendingKind) => void;
  withDraftSearch: (href: string, filter?: AdminUsersFilterKey) => string;
};

export const AdminUsersSearchContext = createContext<AdminUsersSearchValue | null>(null);

export function useAdminUsersSearch() {
  return useContext(AdminUsersSearchContext);
}
