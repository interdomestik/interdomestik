'use client';

import { acceptLegalDocuments } from '@/actions/privacy/accept-legal-documents';
import { LanguageSettings } from '@/components/settings/language-settings';
import { authClient } from '@/lib/auth-client';
import { signOutAndRedirectToLogin } from '@/lib/auth/logout';
import type { LegalTextForDisplay } from '@/lib/privacy/legal-text';
import type { LegalDocumentKind, LegalTextFailure } from '@interdomestik/domain-privacy/acceptance';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent } from '@interdomestik/ui/components/card';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from 'react';

const documentLabels = {
  terms: { read: 'readTerms', check: 'acceptTerms', confirm: 'confirmTerms' },
  privacy_notice: {
    read: 'readPrivacyNotice',
    check: 'acknowledgePrivacyNotice',
    confirm: 'confirmPrivacyNotice',
  },
} as const;

export function MemberAcceptanceForm({
  formToken,
  locale,
  texts,
  pendingKinds,
  unavailable,
}: Readonly<{
  formToken?: string;
  locale: string;
  texts: readonly LegalTextForDisplay[];
  pendingKinds: readonly LegalDocumentKind[];
  unavailable?: LegalTextFailure;
}>) {
  const t = useTranslations('legal-acceptance');
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const notice = useRef<HTMLElement>(null);
  const rememberNotice = useCallback((element: HTMLOutputElement | HTMLParagraphElement | null) => {
    notice.current = element;
  }, []);
  const [checked, setChecked] = useState<Partial<Record<LegalDocumentKind, boolean>>>({});
  const [phase, setPhase] = useState<'ready' | 'saving' | 'opening' | 'stale' | 'signing-out'>(
    'ready'
  );
  const [failure, setFailure] = useState<'saveError' | 'signOutError'>();
  const [textFailure, setTextFailure] = useState(unavailable);
  const [refreshing, refresh] = useTransition();

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (phase === 'stale' || failure || (phase === 'opening' && !refreshing)) {
      notice.current?.focus();
    }
  }, [phase, failure, refreshing]);

  function reopen(nextPhase: 'opening' | 'stale') {
    setPhase(nextPhase);
    refresh(() => router.refresh());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !formToken ||
      phase !== 'ready' ||
      textFailure ||
      !texts.length ||
      !texts.every(text => checked[text.kind])
    )
      return;
    setFailure(undefined);
    setPhase('saving');
    try {
      const result = await acceptLegalDocuments({
        formToken,
        locale,
        documents: texts.map(({ kind, version }) => ({ kind, version })),
        attestations: {
          termsAccepted: checked.terms ? true : undefined,
          privacyNoticeAcknowledged: checked.privacy_notice ? true : undefined,
        },
      });
      if (result.success) {
        reopen('opening');
        return;
      }
      if (result.code === 'stale_version') {
        setChecked({});
        reopen('stale');
        return;
      }
      if (result.code === 'legal_text_mismatch' || result.code === 'legal_text_not_approved') {
        setTextFailure(result.code);
      } else {
        setFailure('saveError');
      }
    } catch {
      setFailure('saveError');
    }
    setPhase('ready');
  }

  async function signOut() {
    setFailure(undefined);
    setPhase('signing-out');
    try {
      await signOutAndRedirectToLogin({ locale, signOut: authClient.signOut });
    } catch {
      setPhase('ready');
      setFailure('signOutError');
    }
  }

  const saving = phase === 'saving';
  const opening = phase === 'opening';
  const stale = phase === 'stale';
  const busy = saving || refreshing || phase === 'signing-out';
  const ready = phase === 'ready' && !textFailure && Boolean(formToken) && texts.length > 0;
  const singleDocument = texts.length === 1 ? texts[0] : undefined;

  return (
    <main className="mx-auto w-full min-w-0 max-w-[720px] p-4 sm:p-6">
      <Card
        aria-labelledby="acceptance-heading"
        data-testid="acceptance-step-ready"
        className="border-teal-600/30 [overflow-wrap:anywhere]"
      >
        <CardContent className="space-y-5 p-4 sm:p-6">
          <h1
            ref={heading}
            tabIndex={-1}
            id="acceptance-heading"
            className="text-2xl font-semibold"
          >
            {t('heading')}
          </h1>
          {/* A soft locale switch retains the previous attestation form in Next.js's route cache. */}
          <LanguageSettings reloadOnLocaleChange />
          {textFailure ? (
            <UnavailableLegalText failure={textFailure} />
          ) : (
            <form onSubmit={submit} aria-busy={busy} className="space-y-5">
              <p>{t('intro')}</p>
              {texts.map(document => (
                <div key={document.kind} className="space-y-2">
                  <details
                    ref={openOnDesktop}
                    data-testid={`legal-document-${document.kind}`}
                    className="rounded-md border p-3"
                  >
                    <summary className="cursor-pointer font-medium">
                      {t(documentLabels[document.kind].read)}
                      {pendingKinds.includes(document.kind) && (
                        <span className="ml-2 text-sm font-normal">{t('reviewPending')}</span>
                      )}
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('version', { version: document.version })}
                    </p>
                    {document.blocks.map(block => (
                      <p key={block.key} data-testid="legal-document-text" className="mt-2">
                        {block.text}
                      </p>
                    ))}
                  </details>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={checked[document.kind] === true}
                      disabled={!ready}
                      onChange={event =>
                        setChecked({ ...checked, [document.kind]: event.target.checked })
                      }
                    />
                    {t(documentLabels[document.kind].check)}
                  </label>
                </div>
              ))}
              <p>
                {t(singleDocument ? documentLabels[singleDocument.kind].confirm : 'confirmBoth')}
              </p>
              {stale && (
                <output className="block" ref={rememberNotice} tabIndex={-1}>
                  {t('stale')}
                </output>
              )}
              {opening && refreshing && <output className="block">{t('opening')}</output>}
              {opening && !refreshing && (
                <p role="alert" ref={rememberNotice} tabIndex={-1}>
                  {t('openError')}
                </p>
              )}
              {failure === 'saveError' && (
                <p role="alert" ref={rememberNotice} tabIndex={-1}>
                  {t(failure)}
                </p>
              )}
              {opening || stale ? (
                <Button type="button" disabled={refreshing} onClick={() => reopen(phase)}>
                  {t('retry')}
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="h-auto min-h-11 whitespace-normal"
                  disabled={!ready || !texts.every(text => checked[text.kind])}
                >
                  {t(submitLabel(saving, failure === 'saveError'))}
                </Button>
              )}
            </form>
          )}
          {failure === 'signOutError' && (
            <p role="alert" ref={rememberNotice} tabIndex={-1}>
              {t(failure)}
            </p>
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={signOut}>
            {t('signOut')}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function UnavailableLegalText({ failure }: Readonly<{ failure: LegalTextFailure }>) {
  const t = useTranslations('legal-acceptance');
  return (
    <output className="block">
      {failure === 'legal_text_not_approved' ? (
        <span className="block">{t('pendingApproval')}</span>
      ) : (
        <>
          <span className="block">{t('unavailable')}</span>
          <span className="block">{t('contactOffice')}</span>
        </>
      )}
    </output>
  );
}

function submitLabel(saving: boolean, retrying: boolean) {
  if (saving) return 'saving';
  return retrying ? 'retry' : 'continue';
}

function openOnDesktop(details: HTMLDetailsElement | null) {
  if (details) details.open = matchMedia('(min-width: 768px)').matches;
}
