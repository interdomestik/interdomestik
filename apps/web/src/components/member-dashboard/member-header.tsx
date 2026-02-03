import type { ReactElement } from 'react';

export type MemberHeaderProps = {
  name: string;
  membershipNumber: string | null;
};

export function MemberHeader({ name, membershipNumber }: MemberHeaderProps): ReactElement {
  return (
    <section data-testid="member-header">
      <h1>{name}</h1>
      <p>{membershipNumber ?? '—'}</p>
    </section>
  );
}
