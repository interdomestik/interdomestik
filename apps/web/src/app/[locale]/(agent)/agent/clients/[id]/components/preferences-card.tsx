import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';

import { PreferencesRecord } from '../_core';

interface PreferenceItem {
  readonly key: keyof NonNullable<PreferencesRecord>;
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
  readonly preferences: PreferencesRecord | null;
  readonly t: (key: string) => string;
  readonly tCommon: (key: string) => string;
}

export function PreferencesCard({ preferences, t, tCommon }: PreferencesCardProps) {
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
