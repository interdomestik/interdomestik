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
import { Input } from '@interdomestik/ui/components/input';
import { Label } from '@interdomestik/ui/components/label';
import { Separator } from '@interdomestik/ui/components/separator';
import { Save, Settings2, ShieldCheck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export default function AdminSettingsPage() {
  const t = useTranslations('admin.settings_page');

  const handleSave = () => {
    toast.success(t('success_message'));
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          {t('save_changes')}
        </Button>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-blue-500" />
              <CardTitle>{t('sections.general.title')}</CardTitle>
            </div>
            <CardDescription>Basic platform identification and contact info.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="app-name">{t('sections.general.app_name')}</Label>
              <Input id="app-name" defaultValue="Interdomestik" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="support-email">{t('sections.general.support_email')}</Label>
              <Input id="support-email" defaultValue="support@interdomestik.com" type="email" />
            </div>
          </CardContent>
        </Card>

        {/* Claims Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <CardTitle>{t('sections.claims.title')}</CardTitle>
            </div>
            <CardDescription>Rules and automation for claim processing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="auto-assign" className="flex flex-col space-y-1">
                <span>{t('sections.claims.auto_assignment')}</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Automatically assign new claims to available agents.
                </span>
              </Label>
              <Checkbox id="auto-assign" defaultChecked />
            </div>
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="expiry">{t('sections.claims.default_expiry')}</Label>
              <Input id="expiry" defaultValue="30" type="number" className="max-w-[100px]" />
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-red-500" />
              <CardTitle>{t('sections.system.title')}</CardTitle>
            </div>
            <CardDescription>System health and maintenance controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="maintenance" className="flex flex-col space-y-1">
                <span>{t('sections.system.maintenance_mode')}</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Prevent user access while performing updates.
                </span>
              </Label>
              <Checkbox id="maintenance" />
            </div>
            <Separator />
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="logging" className="flex flex-col space-y-1">
                <span>{t('sections.system.verbose_logging')}</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Enable detailed logs for debugging purposes.
                </span>
              </Label>
              <Checkbox id="logging" defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
