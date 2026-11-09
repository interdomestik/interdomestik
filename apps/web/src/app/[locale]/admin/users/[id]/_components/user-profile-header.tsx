import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { BadgeCheck, Mail } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getRoleLabel } from '@/lib/roles-i18n';
import { formatPilotDate } from '@/lib/utils/date';

export async function UserProfileHeader({
  locale,
  member,
  membershipStatus,
  membershipBadgeClass,
  isMembershipProfile,
}: {
  locale: string;
  member: {
    id: string;
    memberNumber?: string | null;
    tenantClassificationPending?: boolean;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    emailVerified: Date | null;
    createdAt: Date;
  };
  membershipStatus: string;
  membershipBadgeClass: string;
  isMembershipProfile: boolean;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'admin.member_profile' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });

  return (
    <div className="rounded-2xl border bg-muted/20 p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16">
            <AvatarImage src={member.image || ''} />
            <AvatarFallback className="text-lg">
              {member.name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{member.name || t('labels.unknown')}</h1>
              <Badge variant="outline">{getRoleLabel(tCommon, member.role)}</Badge>
              <Badge className={membershipBadgeClass} variant="outline">
                {t(`status.${isMembershipProfile ? membershipStatus : 'operator'}`)}
              </Badge>
              {member.tenantClassificationPending && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  {t('labels.tenant_review_pending')}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {member.email}
              </span>
              <span className="inline-flex items-center gap-2">
                <BadgeCheck className="h-4 w-4" />
                {member.emailVerified
                  ? t('labels.email_verified_yes')
                  : t('labels.email_verified_no')}
              </span>
            </div>
          </div>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">
              {t(isMembershipProfile ? 'labels.member_id' : 'labels.account_id')}:
            </span>{' '}
            {member.memberNumber || member.id}
          </div>
          <div>
            <span className="font-medium text-foreground">{t('labels.joined')}:</span>{' '}
            {formatPilotDate(member.createdAt, locale, tCommon('none'))}
          </div>
        </div>
      </div>
    </div>
  );
}
