'use client';

import { resendWelcomeEmail } from '@/actions/thank-you-letter';
import { Button } from '@interdomestik/ui/components/button';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function ResendWelcomeEmailButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    setLoading(true);
    try {
      const result = await resendWelcomeEmail(userId);
      if (result.success) {
        toast.success('Welcome email sent successfully!');
      } else {
        toast.error(result.error || 'Failed to send email');
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleResend} disabled={loading}>
      <Mail className="mr-2 h-4 w-4" />
      {loading ? 'Sending...' : 'Resend Welcome Email'}
    </Button>
  );
}
