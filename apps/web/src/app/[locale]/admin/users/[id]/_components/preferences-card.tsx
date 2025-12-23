import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations } from 'next-intl/server';

export async function PreferencesCard({
  preferences,
}: {
  preferences: {
    emailClaimUpdates?: boolean;
    emailNewsletter?: boolean;
    emailMarketing?: boolean;
    pushClaimUpdates?: boolean;
    pushMessages?: boolean;
    inAppAll?: boolean;
  } | null;
}) {
  const t = await getTranslations('admin.member_profile');
  const tCommon = await getTranslations('common');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.preferences')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {preferences ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('preferences.email_claims')}</span>
              <Badge variant={preferences.emailClaimUpdates ? 'default' : 'secondary'}>
                {preferences.emailClaimUpdates ? tCommon('yes') : tCommon('no')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('preferences.email_newsletter')}</span>
              <Badge variant={preferences.emailNewsletter ? 'default' : 'secondary'}>
                {preferences.emailNewsletter ? tCommon('yes') : tCommon('no')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('preferences.email_marketing')}</span>
              <Badge variant={preferences.emailMarketing ? 'default' : 'secondary'}>
                {preferences.emailMarketing ? tCommon('yes') : tCommon('no')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('preferences.push_claims')}</span>
              <Badge variant={preferences.pushClaimUpdates ? 'default' : 'secondary'}>
                {preferences.pushClaimUpdates ? tCommon('yes') : tCommon('no')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('preferences.push_messages')}</span>
              <Badge variant={preferences.pushMessages ? 'default' : 'secondary'}>
                {preferences.pushMessages ? tCommon('yes') : tCommon('no')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('preferences.in_app')}</span>
              <Badge variant={preferences.inAppAll ? 'default' : 'secondary'}>
                {preferences.inAppAll ? tCommon('yes') : tCommon('no')}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">{t('labels.preferences_unset')}</div>
        )}
      </CardContent>
    </Card>
  );
}
