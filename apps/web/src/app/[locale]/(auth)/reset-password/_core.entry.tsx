import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ResetPasswordPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--surface-strong))] p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
