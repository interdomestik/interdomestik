import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ForgotPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--surface-strong))] p-4">
      <ForgotPasswordForm />
    </div>
  );
}
