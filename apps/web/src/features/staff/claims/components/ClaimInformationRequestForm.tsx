'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Input, Label, Textarea } from '@interdomestik/ui';
import { createClaimInformationRequest } from '@/actions/staff-claims/information-request';

function createCorrelationId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function ClaimInformationRequestForm({ claimId }: { readonly claimId: string }) {
  const t = useTranslations('agent-claims.claims.informationRequest');
  const router = useRouter();
  const pending = useRef(false);
  const attempt = useRef<{ fingerprint: string; correlationId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const dueAt = data.get('dueAt');
    const requestedInformation = data.get('requestedInformation');
    const explanationForMember = data.get('explanationForMember');
    if (
      typeof dueAt !== 'string' ||
      typeof requestedInformation !== 'string' ||
      typeof explanationForMember !== 'string'
    ) {
      setFailed(true);
      setFeedback(t('invalid_input'));
      return;
    }
    const due = new Date(dueAt);
    if (!Number.isFinite(due.getTime())) {
      setFailed(true);
      setFeedback(t('invalid_input'));
      return;
    }
    const input = {
      claimId,
      requestedInformation: requestedInformation.trim(),
      explanationForMember: explanationForMember.trim(),
      dueAt: due.toISOString(),
    };
    if (!input.requestedInformation || !input.explanationForMember) {
      setFailed(true);
      setFeedback(t('invalid_input'));
      return;
    }
    const fingerprint = JSON.stringify(input);
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { fingerprint, correlationId: createCorrelationId() };
      }
      const result = await createClaimInformationRequest({
        ...input,
        correlationId: attempt.current.correlationId,
      });
      setFailed(!result.success);
      setFeedback(t(result.success ? 'success' : result.error));
      if (result.success) {
        form.reset();
        attempt.current = null;
        router.refresh();
      }
    } catch {
      setFailed(true);
      setFeedback(t('failed'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border bg-card p-4 space-y-4"
      data-testid="staff-information-request-form"
      aria-label={t('title')}
    >
      <h2 className="font-semibold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <fieldset aria-busy={busy} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="requested-information">{t('requestedInformation')}</Label>
          <Textarea
            id="requested-information"
            name="requestedInformation"
            readOnly={busy}
            required
            maxLength={1000}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="request-explanation">{t('explanationForMember')}</Label>
          <Textarea
            id="request-explanation"
            name="explanationForMember"
            readOnly={busy}
            required
            maxLength={1000}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="request-due-at">{t('dueAt')}</Label>
          <Input id="request-due-at" name="dueAt" type="datetime-local" readOnly={busy} required />
          <p className="text-xs text-muted-foreground">{t('dueHint')}</p>
        </div>
      </fieldset>
      <Button type="submit" aria-disabled={busy} aria-busy={busy}>
        {t(busy ? 'saving' : 'submit')}
      </Button>
      <div className="text-sm">
        <output className="block" aria-live="polite" aria-atomic="true">
          {failed ? null : feedback}
        </output>
        <p role="alert">{failed ? feedback : null}</p>
      </div>
    </form>
  );
}
