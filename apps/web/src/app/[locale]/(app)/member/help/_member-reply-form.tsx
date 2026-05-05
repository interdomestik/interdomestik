'use client';

import {
  submitSupportHandoffMemberReply,
  submitSupportHandoffMemberReplyAndRedirect,
  type MemberReplyActionState,
} from '@/actions/support-handoffs/reply';
import { MAX_MEMBER_REPLY_LENGTH } from '@interdomestik/domain-claims/support-handoffs/types';
import { Button } from '@interdomestik/ui';
import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState, useTransition } from 'react';

type MemberReplyFormProps = Readonly<{
  expectedPublicResponseVersion: number;
  handoffId: string;
  labels: {
    alreadyReplied: string;
    error: string;
    label: string;
    placeholder: string;
    required: string;
    stale: string;
    submit: string;
    submitting: string;
    success: string;
    tooLong: string;
  };
  locale: string;
  permalink: string;
}>;

function resolveMemberReplyError(
  state: MemberReplyActionState,
  labels: MemberReplyFormProps['labels']
) {
  if (state.success || (!state.error && !state.code)) {
    return null;
  }

  if (state.code === 'STALE_VERSION' || state.code === 'CLOSED' || state.code === 'NO_RESPONSE') {
    return labels.stale;
  }

  if (state.code === 'ALREADY_REPLIED') {
    return labels.alreadyReplied;
  }

  if (state.code === 'VALIDATION_REQUIRED') {
    return labels.required;
  }

  if (state.code === 'VALIDATION_TOO_LONG') {
    return labels.tooLong;
  }

  return labels.error;
}

function shouldRefreshAfterFailure(code: MemberReplyActionState['code']) {
  return (
    code === 'ALREADY_REPLIED' ||
    code === 'CLOSED' ||
    code === 'NO_RESPONSE' ||
    code === 'NOT_ACKNOWLEDGED' ||
    code === 'STALE_VERSION'
  );
}

export function MemberReplyForm({
  expectedPublicResponseVersion,
  handoffId,
  labels,
  locale,
  permalink,
}: MemberReplyFormProps) {
  const router = useRouter();
  const [state, setState] = useState<MemberReplyActionState>({ success: false });
  const [pending, startTransition] = useTransition();
  const error = resolveMemberReplyError(state, labels);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ success: false });
    startTransition(() => {
      void submitSupportHandoffMemberReply({ success: false }, formData)
        .then(result => {
          setState(result);
          if (result.success) {
            form.reset();
            router.refresh();
          }
        })
        .catch(() => setState({ error: labels.error, success: false }));
    });
  }

  useEffect(() => {
    if (shouldRefreshAfterFailure(state.code)) {
      router.refresh();
    }
  }, [router, state.code]);

  if (state.success) {
    return (
      <div
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-emerald-800"
        data-testid="member-reply-success"
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{labels.success}</span>
      </div>
    );
  }

  return (
    <form
      action={submitSupportHandoffMemberReplyAndRedirect}
      className="mt-3 space-y-2"
      data-testid="member-reply-form"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="handoffId" value={handoffId} />
      <input
        type="hidden"
        name="expectedPublicResponseVersion"
        value={expectedPublicResponseVersion}
      />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="returnTo" value={permalink} />
      <label htmlFor={`member-reply-${handoffId}`} className="block text-xs font-medium">
        {labels.label}
      </label>
      <textarea
        id={`member-reply-${handoffId}`}
        name="memberReply"
        required
        maxLength={MAX_MEMBER_REPLY_LENGTH}
        placeholder={labels.placeholder}
        className="min-h-24 w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm leading-6 text-emerald-950 placeholder:text-emerald-700/70"
        data-testid="member-reply-input"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        className="border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100"
        data-testid="member-reply-submit"
      >
        {pending ? labels.submitting : labels.submit}
      </Button>
      {error ? (
        <p
          className="text-xs font-medium text-red-700"
          data-testid="member-reply-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
