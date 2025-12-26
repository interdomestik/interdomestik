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

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/actions/user-settings';

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
  const [isLoading, setIsLoading] = useState(!initialPreferences);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...DEFAULT_PREFERENCES,
    ...initialPreferences,
  });

  const syncPushSubscription = async (nextPreferences: NotificationPreferences) => {
    const wantsPush = nextPreferences.pushClaimUpdates || nextPreferences.pushMessages;
    if (!wantsPush) {
      // Best-effort unsubscribe when user disables all push channels.
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;
        const existing = await registration.pushManager.getSubscription();
        if (!existing) return;

        await fetch('/api/settings/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
      } catch {
        // Ignore unsubscribe failures; preferences save should still succeed.
      }
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      return;
    }

    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return;
    }

    const urlBase64ToUint8Array = (base64String: string) => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const registration =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register('/push-sw.js'));

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const json = subscription.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return;
    }

    await fetch('/api/settings/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint,
        keys: { p256dh, auth },
        userAgent: navigator.userAgent,
      }),
    });
  };

  // Load preferences on mount if not provided as props
  useEffect(() => {
    if (initialPreferences) return;

    const loadPreferences = async () => {
      const result = await getNotificationPreferences();
      if (result.success && result.preferences) {
        setPreferences(result.preferences);
      } else if (result.error) {
        toast.error(t('notifications.loadError'));
      }
      setIsLoading(false);
    };

    loadPreferences();
  }, [t, initialPreferences]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateNotificationPreferences(preferences);

      if (result.success) {
        await syncPushSubscription(preferences);
        toast.success(t('notifications.saved'), {
          description: t('notifications.savedDescription'),
        });
      } else {
        toast.error(t('notifications.saveError'));
      }
    });
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/30 backdrop-blur-md shadow-premium relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-xl font-semibold">{t('notifications.title')}</CardTitle>
          </div>
          <CardDescription>{t('notifications.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-20 bg-muted/20 animate-pulse rounded" />
            <div className="h-20 bg-muted/20 animate-pulse rounded" />
            <div className="h-20 bg-muted/20 animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/30 backdrop-blur-md shadow-premium relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-xl font-semibold">{t('notifications.title')}</CardTitle>
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
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="shadow-lg hover:shadow-primary/25 transition-all duration-300"
          >
            {isPending ? t('notifications.saving') : t('notifications.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
