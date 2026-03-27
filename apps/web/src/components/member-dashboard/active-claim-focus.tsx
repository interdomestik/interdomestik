import { Link } from '@/i18n/routing';
import type { ReactElement } from 'react';

export type ActiveClaimFocusProps = {
  title: string;
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
  title,
  claimNumber,
  status,
  stageLabel,
  updatedAt,
  nextMemberAction,
}: ActiveClaimFocusProps): ReactElement {
  return (
    <section data-testid="member-active-claim">
      <h2>{title}</h2>
      <p>{claimNumber ?? '—'}</p>
      <p>{stageLabel}</p>
      <p>{status}</p>
      <p>{updatedAt ?? '—'}</p>
      {nextMemberAction ? <Link href={nextMemberAction.href}>{nextMemberAction.label}</Link> : null}
    </section>
  );
}
