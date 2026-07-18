'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import {
  confirmFreeStartDraftHandoff,
  reviewFreeStartDraftHandoff,
} from '@/actions/free-start-drafts/handoff.core';

import {
  HandoffReview,
  LinkedDraftClaim,
  parseHandoffCopy,
  type HandoffFacts,
} from './draft-claim-handoff-review';
import { parseSecureSaveReviewCopy, type SavedDraft } from './types';

type Props = Readonly<{ draft: SavedDraft & { claimId?: string | null } }>;
type State = 'idle' | 'loading' | 'ready' | 'confirming' | 'error';
type ClaimNotice = 'already' | 'created';

export function DraftClaimHandoff({ draft }: Props) {
  const t = useTranslations('freeStart');
  const locale = useLocale() as 'en' | 'sq' | 'sr' | 'mk';
  const copy = parseHandoffCopy(parseSecureSaveReviewCopy(t.raw('secureSaveReviewCopy')).handoff);
  const regionId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [facts, setFacts] = useState<HandoffFacts | null>(null);
  const [claimId, setClaimId] = useState(draft.claimId ?? null);
  const [claimNotice, setClaimNotice] = useState<ClaimNotice>('already');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (expanded || claimId) headingRef.current?.focus();
  }, [claimId, expanded]);

  async function openReview() {
    setExpanded(true);
    setState('loading');
    setError('');
    const result = await reviewFreeStartDraftHandoff({ id: draft.id }).catch(
      () => ({ ok: false, code: 'unavailable' }) as const
    );
    if (result.ok) {
      setFacts(result.facts);
      setClaimId(result.claimId);
      if (result.claimId) setClaimNotice('already');
      setState('ready');
      return;
    }
    setError(result.code === 'membershipRequired' ? copy.membershipRequired : copy.unavailable);
    setState('error');
  }

  async function confirm() {
    if (!facts || state === 'confirming') return;
    setState('confirming');
    const result = await confirmFreeStartDraftHandoff({
      id: draft.id,
      expectedVersion: facts.version,
      locale,
    }).catch(() => ({ ok: false, code: 'unavailable' }) as const);
    if (result.ok) {
      setClaimId(result.claimId);
      setClaimNotice(result.idempotent ? 'already' : 'created');
      setState('ready');
      return;
    }
    setError(
      result.code === 'draftChanged'
        ? copy.draftChanged
        : result.code === 'membershipRequired'
          ? copy.membershipRequired
          : copy.unavailable
    );
    setState('error');
  }

  if (claimId) {
    return (
      <LinkedDraftClaim
        claimId={claimId}
        copy={copy}
        created={claimNotice === 'created'}
        headingRef={headingRef}
        headingId={`${regionId}-heading`}
      />
    );
  }
  return (
    <section className="mt-4 border-t border-[#001a33]/10 pt-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={openReview}
        disabled={state === 'loading' || state === 'confirming'}
        className="min-h-11 w-full rounded-xl border border-[#006f72] px-4 text-sm font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] sm:w-auto"
      >
        {copy.action}
      </button>
      {expanded ? (
        <HandoffReview
          confirm={confirm}
          copy={copy}
          error={error}
          facts={facts}
          headingRef={headingRef}
          id={regionId}
          state={state}
          t={t}
        />
      ) : null}
    </section>
  );
}
