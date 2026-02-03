import { Link } from '@/i18n/routing';
import type { ReactElement } from 'react';

export type SupportLinkProps = {
  href: string;
};

export function SupportLink({ href }: SupportLinkProps): ReactElement {
  return (
    <section data-testid="member-support-link">
      <Link href={href}>Need help?</Link>
    </section>
  );
}
