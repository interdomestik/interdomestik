import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { getTranslations } from 'next-intl/server';

interface PreferenceItem {
  readonly key: keyof NonNullable<PreferencesCardProps['preferences']>;
  readonly labelKey: string;
}

const PREFERENCE_Items: PreferenceItem[] = [
  { key: 'emailClaimUpdates', labelKey: 'preferences.email_claims' },
  { key: 'emailNewsletter', labelKey: 'preferences.email_newsletter' },
  { key: 'emailMarketing', labelKey: 'preferences.email_marketing' },
  { key: 'pushClaimUpdates', labelKey: 'preferences.push_claims' },
  { key: 'pushMessages', labelKey: 'preferences.push_messages' },
  { key: 'inAppAll', labelKey: 'preferences.in_app' },
];

interface PreferencesCardProps {
  readonly preferences: {
    readonly emailClaimUpdates?: boolean;
    readonly emailNewsletter?: boolean;
    readonly emailMarketing?: boolean;
    readonly pushClaimUpdates?: boolean;
    readonly pushMessages?: boolean;
    readonly inAppAll?: boolean;
  } | null;
}

export async function PreferencesCard({ preferences }: PreferencesCardProps) {
  const t = await getTranslations('admin.member_profile');
  const tCommon = await getTranslations('common');

  if (!preferences) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{t('sections.preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="text-muted-foreground">{t('labels.preferences_unset')}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.preferences')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          {PREFERENCE_Items.map(item => {
            const isEnabled = preferences[item.key] ?? false;
            return (
              <div key={item.key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{t(item.labelKey)}</span>
                <Badge variant={isEnabled ? 'default' : 'secondary'}>
                  {isEnabled ? tCommon('yes') : tCommon('no')}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
