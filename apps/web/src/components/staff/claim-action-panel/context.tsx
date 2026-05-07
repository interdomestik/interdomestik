'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { TranslateFn } from './format-helpers';

type ClaimActionPanelContextValue = {
  claimId: string;
  isPending: boolean;
  startTransition: (callback: () => void) => void;
  t: TranslateFn;
  tStatus: TranslateFn;
};

const ClaimActionPanelContext = createContext<ClaimActionPanelContextValue | null>(null);

export function ClaimActionPanelProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ClaimActionPanelContextValue;
}) {
  return (
    <ClaimActionPanelContext.Provider value={value}>{children}</ClaimActionPanelContext.Provider>
  );
}

export function useClaimActionPanel() {
  const context = useContext(ClaimActionPanelContext);
  if (!context) {
    throw new Error('useClaimActionPanel must be used inside ClaimActionPanelProvider');
  }
  return context;
}
