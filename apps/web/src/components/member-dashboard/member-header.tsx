import type { ReactElement } from 'react';

export type MemberHeaderProps = {
  name: string;
  membershipNumber: string | null;
  testId?: string;
};

export function MemberHeader({
  name,
  membershipNumber,
  testId = 'member-header',
}: MemberHeaderProps): ReactElement {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <p className="text-muted-foreground">{membershipNumber ?? '—'}</p>
      </div>
    </section>
  );
}
