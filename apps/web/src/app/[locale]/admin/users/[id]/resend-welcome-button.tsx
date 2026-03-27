'use client';

import { resendWelcomeEmail } from '@/actions/thank-you-letter';
import { Button } from '@interdomestik/ui/components/button';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

export function ResendWelcomeEmailButton({ userId }: { userId: string }) {
  const t = useTranslations('admin.member_profile.actions');
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    setLoading(true);
    try {
      const result = await resendWelcomeEmail(userId);
      if (result.success) {
        toast.success(t('resend_welcome_email_success'));
      } else {
        toast.error(result.error || t('resend_welcome_email_error'));
      }
    } catch (err) {
      toast.error(t('unexpected_error'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleResend} disabled={loading}>
      <Mail className="mr-2 h-4 w-4" />
      {loading ? t('resend_welcome_email_sending') : t('resend_welcome_email')}
    </Button>
  );
}
