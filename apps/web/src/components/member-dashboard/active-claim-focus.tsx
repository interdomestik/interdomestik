import type { ReactElement } from 'react';

export type ActiveClaimFocusProps = {
  claimNumber: string | null;
  status: string;
  stageLabel: string;
  updatedAt: string | null;
  nextMemberAction?: {
    label: string;
    href: string;
  };
};

export function ActiveClaimFocus({
  claimNumber,
  status,
  stageLabel,
  updatedAt,
  nextMemberAction,
}: ActiveClaimFocusProps): ReactElement {
  return (
    <section data-testid="member-active-claim">
      <h2>Active claim</h2>
      <p>{claimNumber ?? '—'}</p>
      <p>{stageLabel}</p>
      <p>{status}</p>
      <p>{updatedAt ?? '—'}</p>
      {nextMemberAction ? <a href={nextMemberAction.href}>{nextMemberAction.label}</a> : null}
    </section>
  );
}
