'use client';

import { createLeadAction } from '@/actions/leads/create';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@interdomestik/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const TEAM_SIZES = ['1-10', '11-25', '26-50', '51-100', '100+'] as const;
type LeadKind = 'individual' | 'company';

function newRequestKey(): string {
  return globalThis.crypto.randomUUID();
}

function readOptional(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function CreateLeadDialog({ onSuccess }: Readonly<{ onSuccess?: () => void }>) {
  const t = useTranslations('agent.leads_pro.create');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LeadKind>('individual');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  // One key per dialog session: a double submit or a retry replays the same result.
  const [requestKey, setRequestKey] = useState(newRequestKey);

  const reset = () => {
    setKind('individual');
    setConsent(false);
    setRequestKey(newRequestKey());
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consent || pending) return;
    const formData = new FormData(e.currentTarget);
    setPending(true);
    const res = await createLeadAction(
      {
        leadKind: kind,
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        companyName: kind === 'company' ? readOptional(formData, 'companyName') : undefined,
        teamSize: kind === 'company' ? readOptional(formData, 'teamSize') : undefined,
        notes: readOptional(formData, 'notes'),
        consentConfirmed: consent,
      },
      requestKey
    ).finally(() => setPending(false));

    if (res.success) {
      toast.success(t('success'));
      setOpen(false);
      reset();
      router.refresh();
      onSuccess?.();
      return;
    }
    toast.error(res.code === 'POSSIBLE_DUPLICATE' ? t('errors.duplicate') : t('errors.generic'));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button data-testid="new-lead-button">
          <Plus className="w-4 h-4 mr-2" aria-hidden="true" /> {t('trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2" data-testid="create-lead-form">
          <fieldset className="grid grid-cols-2 gap-2" data-testid="lead-form-kind">
            <legend className="mb-2 text-sm font-medium">{t('kind.label')}</legend>
            {(['individual', 'company'] as const).map(option => (
              <label
                key={option}
                className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="leadKind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  data-testid={`lead-form-kind-${option}`}
                />
                {t(`kind.${option}`)}
              </label>
            ))}
          </fieldset>
          {kind === 'company' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="companyName">{t('fields.companyName')}</Label>
                <Input
                  id="companyName"
                  name="companyName"
                  required
                  data-testid="lead-form-company"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="teamSize">{t('fields.teamSize')}</Label>
                <select
                  id="teamSize"
                  name="teamSize"
                  defaultValue=""
                  className="flex min-h-[44px] w-full rounded-md border bg-background px-3 text-sm"
                  data-testid="lead-form-team-size"
                >
                  <option value="">{t('fields.teamSizePlaceholder')}</option>
                  {TEAM_SIZES.map(size => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="firstName">{t('fields.firstName')}</Label>
              <Input id="firstName" name="firstName" required data-testid="lead-form-firstname" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">{t('fields.lastName')}</Label>
              <Input id="lastName" name="lastName" required data-testid="lead-form-lastname" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">{t('fields.email')}</Label>
              <Input id="email" name="email" type="email" required data-testid="lead-form-email" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">{t('fields.phone')}</Label>
              <Input id="phone" name="phone" type="tel" required data-testid="lead-form-phone" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">{t('fields.notes')}</Label>
            <Input id="notes" name="notes" data-testid="lead-form-notes" />
          </div>
          <section
            aria-labelledby="lead-notice-title"
            className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm"
            data-testid="lead-form-notice"
          >
            <h3 id="lead-notice-title" className="font-medium">
              {t('notice.title')}
            </h3>
            <p>{t('notice.body')}</p>
            {kind === 'company' && <p>{t('notice.company')}</p>}
          </section>
          <div className="flex items-start gap-3">
            <Checkbox
              id="leadConsent"
              checked={consent}
              onCheckedChange={value => setConsent(value === true)}
              aria-required="true"
              data-testid="lead-form-consent"
            />
            <Label htmlFor="leadConsent" className="text-sm leading-snug">
              {t('notice.attestation')}
            </Label>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!consent || pending}
            data-testid="lead-form-submit"
          >
            {pending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
