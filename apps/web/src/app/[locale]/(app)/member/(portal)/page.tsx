'use client';

import type { ReactNode } from 'react';

import { usePathname } from '@/i18n/routing';

type Props = Readonly<{ content?: ReactNode }>;

export default function MemberPortalPage({ content = null }: Props = {}) {
  return usePathname() === '/member' ? content : null;
}
