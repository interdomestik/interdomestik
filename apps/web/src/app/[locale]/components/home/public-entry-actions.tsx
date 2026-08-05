import { Globe2, MessageCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PublicSituationActions } from './public-situation-actions';

export { PublicSituationActions } from './public-situation-actions';

type PublicEntryActionsProps = Readonly<{ whatsappHref?: string }>;

export function PublicSupportPanel({ whatsappHref }: PublicEntryActionsProps) {
  const t = useTranslations('hero.publicEntry');

  return (
    <div className="space-y-4 pt-6 text-[#001A33]">
      {whatsappHref ? (
        <>
          <a
            href={whatsappHref}
            className="group flex min-h-11 items-start gap-3 text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
          >
            <MessageCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <strong>{t('whatsappLink')}</strong>
              <small className="mt-1 block text-sm text-[#334D5C] no-underline">
                {t('availability')}
              </small>
            </span>
          </a>
          <a
            href={whatsappHref}
            className="group flex min-h-11 items-start gap-3 text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
          >
            <Globe2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <small className="block text-xs font-bold uppercase tracking-[0.14em] text-[#334D5C] no-underline">
                {t('diasporaEyebrow')}
              </small>
              <strong className="mt-1 block">{t('diasporaLink')}</strong>
            </span>
          </a>
        </>
      ) : null}
      <p className="flex gap-3 text-sm leading-6 text-[#334D5C]">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#8A5500]" />
        {t('emergency')}
      </p>
      <div className="flex gap-3 border-t border-[#B8C7C7] pt-4">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#006A70]" />
        <p>
          <strong className="block text-base">{t('privacyTitle')}</strong>
          <span className="mt-1 block text-sm leading-6 text-[#334D5C]">{t('privacyBody')}</span>
        </p>
      </div>
    </div>
  );
}

export function PublicEntryActions({ whatsappHref }: PublicEntryActionsProps) {
  return (
    <>
      <PublicSituationActions />
      <PublicSupportPanel whatsappHref={whatsappHref} />
    </>
  );
}
