'use client';

import {
  EntityDisclosureNotice,
  type EntityDisclosureNoticeModel,
} from '@/components/commercial/entity-disclosure-notice';
import { useTranslations } from 'next-intl';

type MembershipEntityDisclosureNoticeProps = Readonly<{
  disclosure?: EntityDisclosureNoticeModel | null;
  testId: string;
}>;

export function MembershipEntityDisclosureNotice({
  disclosure,
  testId,
}: MembershipEntityDisclosureNoticeProps) {
  const t = useTranslations('entityDisclosure');

  return (
    <EntityDisclosureNotice
      testId={testId}
      disclosure={disclosure}
      labels={{
        title: t('title'),
        contractingCompany: t('contractingCompany'),
        governingLaw: t('governingLaw'),
        unavailableTitle: t('unavailableTitle'),
        unavailableBody: t('unavailableBody'),
      }}
    />
  );
}
