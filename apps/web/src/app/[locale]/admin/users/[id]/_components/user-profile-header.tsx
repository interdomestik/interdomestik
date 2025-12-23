import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { BadgeCheck, Mail } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatDate } from './utils';

export async function UserProfileHeader({
  member,
  membershipStatus,
  membershipBadgeClass,
}: {
  member: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    emailVerified: Date | null;
    createdAt: Date;
  };
  membershipStatus: string;
  membershipBadgeClass: string;
}) {
  const t = await getTranslations('admin.member_profile');
  const tCommon = await getTranslations('common');

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
              <Badge variant="outline">{tCommon(`roles.${member.role}`)}</Badge>
              <Badge className={membershipBadgeClass} variant="outline">
                {t(`status.${membershipStatus}`)}
              </Badge>
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
            <span className="font-medium text-foreground">{t('labels.member_id')}:</span>{' '}
            {member.id}
          </div>
          <div>
            <span className="font-medium text-foreground">{t('labels.joined')}:</span>{' '}
            {formatDate(member.createdAt, tCommon('none'))}
          </div>
        </div>
      </div>
    </div>
  );
}
