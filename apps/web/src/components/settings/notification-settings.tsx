'use client';

import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Checkbox } from '@interdomestik/ui/components/checkbox';
import { Label } from '@interdomestik/ui/components/label';
import { Separator } from '@interdomestik/ui/components/separator';
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

interface NotificationPreferences {
  emailClaimUpdates: boolean;
  emailMarketing: boolean;
  emailNewsletter: boolean;
  pushClaimUpdates: boolean;
  pushMessages: boolean;
  inAppAll: boolean;
}

interface NotificationSettingsProps {
  initialPreferences?: Partial<NotificationPreferences>;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: true,
  pushClaimUpdates: true,
  pushMessages: true,
  inAppAll: true,
};

export function NotificationSettings({ initialPreferences }: NotificationSettingsProps) {
  const t = useTranslations('settings');
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...DEFAULT_PREFERENCES,
    ...initialPreferences,
  });

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch('/api/settings/notifications');
        if (response.ok) {
          const data = await response.json();
          setPreferences(prev => ({ ...prev, ...data }));
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
        toast.error(t('notifications.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [t]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const response = await fetch('/api/settings/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preferences),
        });

        if (!response.ok) {
          throw new Error('Failed to save preferences');
        }

        toast.success(t('notifications.saved'), {
          description: t('notifications.savedDescription'),
        });
      } catch (error) {
        console.error('Failed to save preferences:', error);
        toast.error(t('notifications.saveError'));
      }
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('notifications.title')}</CardTitle>
          </div>
          <CardDescription>{t('notifications.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-20 bg-muted animate-pulse rounded" />
            <div className="h-20 bg-muted animate-pulse rounded" />
            <div className="h-20 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <CardTitle>{t('notifications.title')}</CardTitle>
        </div>
        <CardDescription>{t('notifications.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email Notifications */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('notifications.email.title')}</h4>
          </div>

          <div className="ml-6 space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="email-claim-updates"
                checked={preferences.emailClaimUpdates}
                onCheckedChange={() => handleToggle('emailClaimUpdates')}
              />
              <div className="space-y-0.5">
                <Label htmlFor="email-claim-updates" className="cursor-pointer">
                  {t('notifications.email.claimUpdates')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.email.claimUpdatesHint')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="email-newsletter"
                checked={preferences.emailNewsletter}
                onCheckedChange={() => handleToggle('emailNewsletter')}
              />
              <div className="space-y-0.5">
                <Label htmlFor="email-newsletter" className="cursor-pointer">
                  {t('notifications.email.newsletter')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.email.newsletterHint')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="email-marketing"
                checked={preferences.emailMarketing}
                onCheckedChange={() => handleToggle('emailMarketing')}
              />
              <div className="space-y-0.5">
                <Label htmlFor="email-marketing" className="cursor-pointer">
                  {t('notifications.email.marketing')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.email.marketingHint')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Push Notifications */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('notifications.push.title')}</h4>
          </div>

          <div className="ml-6 space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="push-claim-updates"
                checked={preferences.pushClaimUpdates}
                onCheckedChange={() => handleToggle('pushClaimUpdates')}
              />
              <div className="space-y-0.5">
                <Label htmlFor="push-claim-updates" className="cursor-pointer">
                  {t('notifications.push.claimUpdates')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.push.claimUpdatesHint')}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="push-messages"
                checked={preferences.pushMessages}
                onCheckedChange={() => handleToggle('pushMessages')}
              />
              <div className="space-y-0.5">
                <Label htmlFor="push-messages" className="cursor-pointer">
                  {t('notifications.push.messages')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.push.messagesHint')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* In-App Notifications */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">{t('notifications.inApp.title')}</h4>
          </div>

          <div className="ml-6 space-y-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="in-app-all"
                checked={preferences.inAppAll}
                onCheckedChange={() => handleToggle('inAppAll')}
              />
              <div className="space-y-0.5">
                <Label htmlFor="in-app-all" className="cursor-pointer">
                  {t('notifications.inApp.all')}
                </Label>
                <p className="text-xs text-muted-foreground">{t('notifications.inApp.allHint')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? t('notifications.saving') : t('notifications.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
