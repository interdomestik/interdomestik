import { renderLegalTexts } from '@/lib/privacy/legal-text';
import { checkMemberAcceptanceTexts } from '@/lib/privacy/require-member-acceptance';
import type { LegalDocument } from '@interdomestik/domain-privacy/acceptance';
import { notFound, redirect } from 'next/navigation';
import { MemberAcceptanceForm } from './member-acceptance-form';

export async function MemberAcceptanceStep({
  locale,
  refusal,
}: {
  locale: string;
  refusal: { failure: { code: string }; missing?: LegalDocument[] };
}) {
  if (refusal.failure.code === 'UNAUTHORIZED') redirect(`/${locale}/login`);
  if (!refusal.missing?.length) notFound();

  const rendered = renderLegalTexts(locale, refusal.missing);
  const verification = rendered.ok
    ? await checkMemberAcceptanceTexts(locale, rendered.texts)
    : rendered;

  return (
    <div data-testid="dashboard-page-ready">
      <MemberAcceptanceForm
        key={verification.ok ? verification.formToken : verification.code}
        formToken={verification.ok ? verification.formToken : undefined}
        locale={locale}
        texts={rendered.ok && verification.ok ? rendered.texts : []}
        pendingKinds={verification.ok ? verification.pending : []}
        unavailable={verification.ok ? undefined : verification.code}
      />
    </div>
  );
}
