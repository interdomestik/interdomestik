'use client';

import { Button } from '@interdomestik/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';

type StatusCopy = {
  activeAccount: string;
  activeClaim: string;
  activeHelper: string;
  recheck: string;
  account: string;
  helper: string;
  pending: string;
  active: string;
};

export function SuccessStatusActions(props: {
  locale: string;
  membershipActive: boolean;
  checkRequested: boolean;
  copy: StatusCopy;
}) {
  const router = useRouter();
  const announcement = props.checkRequested
    ? props.membershipActive
      ? props.copy.active
      : props.copy.pending
    : null;

  function handleRecheck(event: MouseEvent<HTMLAnchorElement>): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (props.checkRequested) {
      router.refresh();
      return;
    }
    router.replace(`/${props.locale}/member/membership/success?check=1`, { scroll: false });
  }

  return (
    <div className="mt-12 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {props.membershipActive ? (
          <>
            <Action href={`/${props.locale}/member`}>{props.copy.activeAccount}</Action>
            <Action href={`/${props.locale}/member/claims/new`} variant="outline">
              {props.copy.activeClaim}
            </Action>
          </>
        ) : (
          <>
            <Action
              href={`/${props.locale}/member/membership/success?check=1`}
              onClick={handleRecheck}
              describedBy="membership-status-helper"
            >
              {props.copy.recheck}
            </Action>
            <Action href={`/${props.locale}/member`} variant="outline">
              {props.copy.account}
            </Action>
          </>
        )}
      </div>
      <p
        id={props.membershipActive ? undefined : 'membership-status-helper'}
        className="mt-4 text-center text-sm text-muted-foreground"
      >
        {props.membershipActive ? props.copy.activeHelper : props.copy.helper}
      </p>
      {announcement ? (
        <p role="status" className="mt-3 text-center text-sm font-medium text-foreground">
          {announcement}
        </p>
      ) : null}
    </div>
  );
}

function Action(props: {
  href: string;
  children: string;
  variant?: 'outline';
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  describedBy?: string;
}) {
  return (
    <Button
      asChild
      size="lg"
      variant={props.variant}
      className="min-h-[44px] rounded-2xl px-6 font-bold"
    >
      <Link href={props.href} onClick={props.onClick} aria-describedby={props.describedBy}>
        {props.children}
      </Link>
    </Button>
  );
}
