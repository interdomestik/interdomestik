'use client';

import {
  submitBusinessMembershipLead,
  type SubmitBusinessMembershipLeadResult,
} from '@/lib/actions/business-membership-lead';
import { Button, Input, Label } from '@interdomestik/ui';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const initialState: SubmitBusinessMembershipLeadResult | null = null;

const teamSizeOptions = ['1-10', '11-25', '26-50', '51-100', '100+'] as const;

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `business-lead-${Date.now()}`;
}

export function BusinessLeadForm({ locale }: Readonly<{ locale: string }>) {
  const t = useTranslations('pricing.businessLead.form');
  const [serverState, formAction, pending] = useActionState(
    submitBusinessMembershipLead,
    initialState
  );
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const formRef = useRef<HTMLFormElement>(null);
  const lastToastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!serverState) {
      return;
    }

    if (serverState.success) {
      const signature = `success:${serverState.data?.leadId ?? 'ok'}`;
      if (lastToastSignatureRef.current !== signature) {
        toast.success(t('successToast'));
        lastToastSignatureRef.current = signature;
      }

      formRef.current?.reset();
      setIdempotencyKey(createIdempotencyKey());
      return;
    }

    const signature = `error:${serverState.code ?? serverState.error}`;
    if (lastToastSignatureRef.current !== signature) {
      toast.error(serverState.error);
      lastToastSignatureRef.current = signature;
    }
  }, [serverState, t]);

  const fieldErrors = serverState?.success ? {} : (serverState?.issues ?? {});

  return (
    <section
      data-testid="business-lead-form"
      className="mt-10 rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-6 shadow-sm md:p-8"
    >
      <div className="max-w-2xl">
        <h2 className="text-2xl font-black tracking-tight text-slate-950">{t('title')}</h2>
        <p className="mt-2 text-sm font-medium text-slate-600">{t('subtitle')}</p>
      </div>

      {serverState?.success && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">{t('successTitle')}</p>
            <p>{t('successBody')}</p>
          </div>
        </div>
      )}

      {!serverState?.success && serverState?.error && serverState.code !== 'INVALID_PAYLOAD' && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {serverState.error}
        </div>
      )}

      <form ref={formRef} action={formAction} className="mt-6 grid gap-5 md:grid-cols-2" noValidate>
        <input type="hidden" name="_idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="locale" value={locale} />

        <div className="space-y-2">
          <Label htmlFor="firstName">{t('fields.firstName')}</Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            placeholder={t('placeholders.firstName')}
            aria-invalid={Boolean(fieldErrors.firstName)}
            aria-describedby={fieldErrors.firstName ? 'business-lead-firstName-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.firstName && (
            <p id="business-lead-firstName-error" className="text-sm font-medium text-red-600">
              {fieldErrors.firstName}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">{t('fields.lastName')}</Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            placeholder={t('placeholders.lastName')}
            aria-invalid={Boolean(fieldErrors.lastName)}
            aria-describedby={fieldErrors.lastName ? 'business-lead-lastName-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.lastName && (
            <p id="business-lead-lastName-error" className="text-sm font-medium text-red-600">
              {fieldErrors.lastName}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="companyName">{t('fields.companyName')}</Label>
          <Input
            id="companyName"
            name="companyName"
            autoComplete="organization"
            placeholder={t('placeholders.companyName')}
            aria-invalid={Boolean(fieldErrors.companyName)}
            aria-describedby={
              fieldErrors.companyName ? 'business-lead-companyName-error' : undefined
            }
            disabled={pending}
          />
          {fieldErrors.companyName && (
            <p id="business-lead-companyName-error" className="text-sm font-medium text-red-600">
              {fieldErrors.companyName}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t('fields.email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t('placeholders.email')}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'business-lead-email-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.email && (
            <p id="business-lead-email-error" className="text-sm font-medium text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">{t('fields.phone')}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder={t('placeholders.phone')}
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? 'business-lead-phone-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.phone && (
            <p id="business-lead-phone-error" className="text-sm font-medium text-red-600">
              {fieldErrors.phone}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="teamSize">{t('fields.teamSize')}</Label>
          <select
            id="teamSize"
            name="teamSize"
            defaultValue=""
            aria-invalid={Boolean(fieldErrors.teamSize)}
            aria-describedby={fieldErrors.teamSize ? 'business-lead-teamSize-error' : undefined}
            disabled={pending}
            className="flex min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <option value="" disabled>
              {t('placeholders.teamSize')}
            </option>
            {teamSizeOptions.map(option => (
              <option key={option} value={option}>
                {t(`teamSizeOptions.${option}`)}
              </option>
            ))}
          </select>
          {fieldErrors.teamSize && (
            <p id="business-lead-teamSize-error" className="text-sm font-medium text-red-600">
              {fieldErrors.teamSize}
            </p>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">{t('fields.notes')}</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={5}
            placeholder={t('placeholders.notes')}
            aria-invalid={Boolean(fieldErrors.notes)}
            aria-describedby={fieldErrors.notes ? 'business-lead-notes-error' : undefined}
            disabled={pending}
          />
          {fieldErrors.notes && (
            <p id="business-lead-notes-error" className="text-sm font-medium text-red-600">
              {fieldErrors.notes}
            </p>
          )}
        </div>

        <div className="md:col-span-2 flex flex-col gap-3 border-t border-slate-200 pt-5">
          <p className="text-sm font-medium text-slate-500">{t('privacyNote')}</p>
          <Button
            type="submit"
            disabled={pending}
            className="min-h-[44px] w-full touch-manipulation rounded-2xl text-base font-black md:w-auto"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('submitPending')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}
