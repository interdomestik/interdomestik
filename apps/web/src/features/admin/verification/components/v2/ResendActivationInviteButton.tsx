'use client';

import { Button } from '@interdomestik/ui';
import { MailPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ResendActivationInviteButtonProps {
  id: string;
  onResend: (id: string) => Promise<void>;
}

/** Resends a converted member's activation email; disabled while the request is in flight. */
export function ResendActivationInviteButton({
  id,
  onResend,
}: Readonly<ResendActivationInviteButtonProps>) {
  const t = useTranslations('admin.leads.actions');
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      className="h-8 gap-1 px-2"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend(id);
        } finally {
          setBusy(false);
        }
      }}
      data-testid="resend-activation-invite"
    >
      <MailPlus className="w-4 h-4" aria-hidden="true" />
      {t('resend_invite')}
    </Button>
  );
}
