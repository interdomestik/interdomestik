'use client';

import {
  issueInboundEvidenceIntent,
  recordInboundEvidenceDecision,
  uploadInboundEvidence,
} from '@/features/admin/claims/actions/inbound-evidence-upload';
import {
  RegisterFeedback,
  RegisterInput,
  RegisterSubmit,
  useRegisterCorrelation,
  useRegisterMutation,
} from '@/features/staff/claims/components/case-register-controls';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';

const PDF_MAX_BYTES = 1024 * 1024;

export function InboundEvidenceUploadForm({
  claimId,
  mode,
}: Readonly<{ claimId: string; mode: 'staff' | 'tenant_admin' }>) {
  const t = useTranslations('staff-correspondence.inbound');
  const title = useId();
  const [receipt, setReceipt] = useState('');
  const [file, setFile] = useState<File>();
  const [decisionId, setDecisionId] = useState('');
  const [recorded, setRecorded] = useState(false);
  const mutation = useRegisterMutation();
  const correlation = useRegisterCorrelation();
  const oversize = Boolean(file && file.size > PDF_MAX_BYTES);

  function record(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || oversize) return;
    mutation.run(async () => {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte =>
        byte.toString(16).padStart(2, '0')
      ).join('');
      const input = {
        claimId,
        classification: mode === 'staff' ? 'intended-for-member' : 'approved-to-show',
        officeReceiptRef: receipt.trim(),
        fileName: file.name,
        fileSize: file.size,
        sha256,
      };
      const result = await recordInboundEvidenceDecision({
        ...input,
        correlationId: correlation.forInput(input),
      });
      if (result.success && result.data) {
        setDecisionId(result.data.decisionId);
        setRecorded(true);
      }
      return result;
    });
  }

  function publish() {
    if (!file || oversize || !decisionId.trim()) return;
    mutation.run(
      async () => {
        const issued = await issueInboundEvidenceIntent({ claimId, decisionId: decisionId.trim() });
        if (!issued.success || !issued.data) return issued;
        const data = new FormData();
        data.set('claimId', claimId);
        data.set('intentToken', issued.data.intentToken);
        data.set('file', file);
        return uploadInboundEvidence(undefined, data);
      },
      () => {
        setDecisionId('');
        setRecorded(false);
        setFile(undefined);
        setReceipt('');
        correlation.clear();
      }
    );
  }

  return (
    <section aria-labelledby={title} className="grid gap-2">
      <h3 id={title} className="font-medium">
        {t('title')}
      </h3>
      <form onSubmit={record} aria-labelledby={title}>
        <fieldset disabled={mutation.pending} className="grid gap-2">
          <p>{t('custody')}</p>
          <RegisterInput
            label={t('file')}
            type="file"
            accept="application/pdf,.pdf"
            onChange={event => {
              setFile(event.currentTarget.files?.[0]);
              setRecorded(false);
            }}
          />
          {oversize && <p role="alert">{t('oversize')}</p>}
          <RegisterInput
            label={t('officeRef')}
            value={receipt}
            maxLength={128}
            onChange={event => {
              setReceipt(event.currentTarget.value);
              setRecorded(false);
            }}
          />
          <RegisterSubmit
            pending={mutation.pending}
            disabled={!file || oversize || !receipt.trim()}
          >
            {t(mode === 'staff' ? 'intended' : 'approved')}
          </RegisterSubmit>
          {mode === 'staff' ? (
            <>
              <RegisterInput
                label={t('decisionRef')}
                value={decisionId}
                maxLength={36}
                onChange={event => {
                  setDecisionId(event.currentTarget.value);
                  setRecorded(false);
                }}
              />
              <button
                type="button"
                className="w-fit underline disabled:opacity-50"
                disabled={!file || oversize || !decisionId.trim()}
                onClick={publish}
              >
                {t('upload')}
              </button>
            </>
          ) : (
            recorded && (
              <p role="status">
                {t('decisionRef')} <code>{decisionId}</code>
              </p>
            )
          )}
        </fieldset>
        <RegisterFeedback {...mutation} />
      </form>
    </section>
  );
}
