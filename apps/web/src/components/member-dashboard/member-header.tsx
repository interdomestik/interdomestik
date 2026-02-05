import type { ReactElement } from 'react';
import { PortalSurfaceIndicator } from '../dashboard/portal-surface-indicator';

export type MemberHeaderProps = {
  name: string;
  membershipNumber: string | null;
};

export function MemberHeader({ name, membershipNumber }: MemberHeaderProps): ReactElement {
  return (
    <section
      data-testid="member-header"
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <p className="text-muted-foreground">{membershipNumber ?? '—'}</p>
      </div>
      <PortalSurfaceIndicator />
    </section>
  );
}
