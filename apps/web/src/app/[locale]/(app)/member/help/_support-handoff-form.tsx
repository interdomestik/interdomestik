'use client';

import { createMemberSupportHandoff } from '@/actions/support-handoffs/create';
import { Button } from '@interdomestik/ui/components/button';
import { useFormStatus } from 'react-dom';

type MemberClaimOption = {
  id: string;
  claimNumber: string | null;
  status: string | null;
  title: string | null;
};

type MemberSupportHandoffFormLabels = {
  claim: string;
  contactPreference: string;
  contactPreferenceEmail: string;
  contactPreferencePhone: string;
  contactPreferenceStaffReply: string;
  contactPreferenceWhatsApp: string;
  message: string;
  noClaim: string;
  subject: string;
  submit: string;
};

type MemberSupportHandoffFormProps = {
  claimOptions: MemberClaimOption[];
  labels: MemberSupportHandoffFormLabels;
  locale: string;
  selectedClaimId?: string | null;
  sourceClaimId?: string | null;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} data-testid="member-support-handoff-submit">
      {label}
    </Button>
  );
}

export function MemberSupportHandoffForm({
  claimOptions,
  labels,
  locale,
  selectedClaimId = null,
  sourceClaimId = null,
}: MemberSupportHandoffFormProps) {
  return (
    <form
      action={createMemberSupportHandoff}
      className="space-y-4"
      data-testid="member-support-handoff-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="source"
        value={sourceClaimId ? 'member_claim_detail' : 'member_help'}
      />
      {sourceClaimId ? <input type="hidden" name="sourceClaimId" value={sourceClaimId} /> : null}
      <div className="space-y-2">
        <label htmlFor="support-subject" className="text-sm font-medium">
          {labels.subject}
        </label>
        <input
          id="support-subject"
          name="subject"
          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          maxLength={120}
          required
          data-testid="member-support-handoff-subject"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="support-message" className="text-sm font-medium">
          {labels.message}
        </label>
        <textarea
          id="support-message"
          name="message"
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          maxLength={2000}
          required
          data-testid="member-support-handoff-message"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="support-contact-preference" className="text-sm font-medium">
            {labels.contactPreference}
          </label>
          <select
            id="support-contact-preference"
            name="contactPreference"
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            defaultValue="staff_reply"
            data-testid="member-support-handoff-contact-preference"
          >
            <option value="staff_reply">{labels.contactPreferenceStaffReply}</option>
            <option value="phone">{labels.contactPreferencePhone}</option>
            <option value="email">{labels.contactPreferenceEmail}</option>
            <option value="whatsapp">{labels.contactPreferenceWhatsApp}</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="support-claim" className="text-sm font-medium">
            {labels.claim}
          </label>
          <select
            id="support-claim"
            name="claimId"
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            defaultValue={selectedClaimId ?? ''}
            data-testid="member-support-handoff-claim"
          >
            <option value="">{labels.noClaim}</option>
            {claimOptions.map(claim => (
              <option key={claim.id} value={claim.id}>
                {claim.claimNumber || claim.title || claim.id}
                {claim.status ? ` (${claim.status})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <SubmitButton label={labels.submit} />
    </form>
  );
}
