'use client';

import { Link } from '@/i18n/routing';
import { registerMember } from '@/lib/actions/agent';
import { Button } from '@interdomestik/ui/components/button';
import { Input } from '@interdomestik/ui/components/input';
import { Label } from '@interdomestik/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

const initialState = {
  error: '',
  fields: undefined as Record<string, string[]> | undefined,
};

export function RegisterMemberForm() {
  const t = useTranslations('agent-members.members.register.form');
  const tPlans = useTranslations('agent-members.members.register.plans');
  const [state, action, pending] = useActionState(registerMember, initialState);

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fullName">{t('full_name')}</Label>
        <Input
          id="fullName"
          name="fullName"
          placeholder={t('full_name_placeholder')}
          required
          aria-invalid={!!state?.fields?.fullName}
        />
        {state?.fields?.fullName && (
          <p className="text-sm text-destructive">{state.fields.fullName[0]}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={t('email_placeholder')}
            required
          />
          {state?.fields?.email && (
            <p className="text-sm text-destructive">{state.fields.email[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input id="phone" name="phone" placeholder={t('phone_placeholder')} required />
          {state?.fields?.phone && (
            <p className="text-sm text-destructive">{state.fields.phone[0]}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="planId">{t('plan')}</Label>
        <Select name="planId" defaultValue="standard">
          <SelectTrigger>
            <SelectValue placeholder={t('select_plan')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">{tPlans('standard')}</SelectItem>
            <SelectItem value="family">{tPlans('family')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t('notes')}</Label>
        <Textarea id="notes" name="notes" placeholder={t('notes_placeholder')} />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" asChild disabled={pending}>
          <Link href="/agent/users">{t('cancel')}</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
