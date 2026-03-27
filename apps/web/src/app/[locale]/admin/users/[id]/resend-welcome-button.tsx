'use client';

import { resendWelcomeEmail } from '@/actions/thank-you-letter';
import { Button } from '@interdomestik/ui/components/button';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

export function ResendWelcomeEmailButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const t = useTranslations('admin.member_profile.actions');

  async function handleResend() {
    setLoading(true);
    try {
      const result = await resendWelcomeEmail(userId);
      if (result.success) {
        toast.success(t('resend_welcome_success'));
      } else {
        toast.error(result.error || t('resend_welcome_failed'));
      }
    } catch (err) {
      toast.error(t('resend_welcome_unexpected'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleResend} disabled={loading}>
      <Mail className="mr-2 h-4 w-4" />
      {loading ? t('resend_welcome_loading') : t('resend_welcome')}
    </Button>
  );
}
