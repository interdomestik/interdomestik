'use client';

import { readReceivedDocumentOptions } from '@/actions/staff-claims/correspondence';
import { Button } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { RegisterDocument } from './case-register-controls';

export function ClaimReceivedDocumentPicker({
  claimId,
  selection,
  onSelectionChange,
}: Readonly<{
  claimId: string;
  selection: RegisterDocument[];
  onSelectionChange: (documents: RegisterDocument[]) => void;
}>) {
  const t = useTranslations('staff-correspondence.inbound');
  const common = useTranslations('common');
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState<{ documents: RegisterDocument[]; nextCursor?: string }>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);

  function load(cursors: (string | undefined)[]) {
    if (pending) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await readReceivedDocumentOptions({ claimId, after: cursors.at(-1) });
        if (!result.success || !result.data) {
          setFailed(true);
          return;
        }
        setPage(result.data);
        setHistory(cursors);
      } catch {
        setFailed(true);
      }
    });
  }

  function change(document: RegisterDocument, checked: boolean) {
    if (checked && selection.length < 20) onSelectionChange([...selection, document]);
    if (!checked) onSelectionChange(selection.filter(item => item.id !== document.id));
  }

  return (
    <fieldset className="grid min-w-0 gap-2 sm:col-span-2" aria-busy={pending} disabled={pending}>
      <legend>{t('received')}</legend>
      {selection.length > 0 && (
        <ul aria-label={t('selection')}>
          {selection.map(document => (
            <li key={document.id}>
              <label>
                <input type="checkbox" checked onChange={() => change(document, false)} />{' '}
                {document.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      {page?.documents.length === 0 && <p>{t('empty')}</p>}
      {page?.documents
        .filter(document => !selection.some(item => item.id === document.id))
        .map(document => (
          <label key={document.id}>
            <input
              type="checkbox"
              checked={false}
              disabled={selection.length >= 20}
              onChange={event => change(document, event.currentTarget.checked)}
            />{' '}
            {document.name}
          </label>
        ))}
      <div className="flex flex-wrap gap-2">
        {!page && (
          <Button type="button" variant="outline" onClick={() => load([undefined])}>
            {t('find')}
          </Button>
        )}
        {history.length > 1 && (
          <Button type="button" variant="outline" onClick={() => load(history.slice(0, -1))}>
            {common('previous')}
          </Button>
        )}
        {page?.nextCursor && (
          <Button
            type="button"
            variant="outline"
            onClick={() => load([...history, page.nextCursor])}
          >
            {common('next')}
          </Button>
        )}
      </div>
      {failed && <p role="alert">{common('errors.generic')}</p>}
    </fieldset>
  );
}
