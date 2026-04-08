import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { PUBLIC_MEMBERSHIP_ENTRY_HREF } from '@/lib/public-membership-entry';
import { Mail, MapPin, MessageCircle, Phone, Shield, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  const common = useTranslations('common');
  const { phone, whatsapp, address, hours } = contactInfo;
  const safetyNetChips = Array.isArray(t.raw('safetyNet.chips'))
    ? (t.raw('safetyNet.chips') as string[])
    : [];

  return (
    <footer className="bg-slate-900 text-white">
      {/* Main Footer Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="font-display font-black text-xl">{common('appName')}</span>
                <p className="text-xs text-slate-200 font-bold">{common('tagline')}</p>
              </div>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-6 max-w-sm font-medium">
              {t('description')}
            </p>

            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-bold mb-8">
              <ShieldCheck className="h-4 w-4" />
              {t('noWinNoFee')}
            </div>

            <div
              data-testid="footer-safety-net"
              className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_18px_48px_-36px_rgba(15,23,42,0.9)]"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-300">
                {t('safetyNet.eyebrow')}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-white">{t('safetyNet.title')}</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                {t('safetyNet.body')}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {phone ? (
                  <a
                    data-testid="footer-safety-net-call"
                    href={`tel:${phone.replaceAll(' ', '')}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {t('safetyNet.call')}
                  </a>
                ) : null}
                {whatsapp ? (
                  <a
                    data-testid="footer-safety-net-whatsapp"
                    href={whatsapp}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:border-green-400/40 hover:text-green-300"
                  >
                    <MessageCircle className="h-4 w-4 text-green-400" aria-hidden="true" />
                    {t('safetyNet.whatsapp')}
                  </a>
                ) : null}
              </div>
              {safetyNetChips.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {safetyNetChips.map(chip => (
                    <span
                      key={chip}
                      data-testid="footer-safety-net-chip"
                      className="inline-flex items-center rounded-full border border-white/10 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              {phone && (
                <a
                  href={`tel:${phone.replaceAll(' ', '')}`}
                  className="flex items-center gap-3 text-white hover:text-primary transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <Phone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-200">{phone}</p>
                    <p className="text-xs text-slate-300 font-bold">{t('hotlineLabel')}</p>
                  </div>
                </a>
              )}
              {whatsapp && (
                <a
                  href={whatsapp}
                  className="flex items-center gap-3 text-white hover:text-green-400 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center group-hover:bg-green-500/10 transition-colors">
                    <MessageCircle className="h-5 w-5 text-green-500" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-200">WhatsApp</p>
                    <p className="text-xs text-slate-300 font-bold">{t('chatWithUs')}</p>
                  </div>
                </a>
              )}
              {address && (
                <div className="flex items-center gap-3 text-slate-300">
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{address}</p>
                    {hours && (
                      <p className="text-xs text-slate-300 font-bold">{t('hours', { hours })}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Membership Links */}
          <div>
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300 mb-6">
              {t('membership')}
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/pricing"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('plansPricing')}
                </Link>
              </li>
              <li>
                <Link
                  href={PUBLIC_MEMBERSHIP_ENTRY_HREF}
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('joinClub')}
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('memberLogin')}
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('about')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300 mb-6">
              {t('legal')}
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('privacy')}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/terms"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('terms')}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/cookies"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('cookies')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300 mb-6">
              {t('support')}
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/help"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('help')}
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-slate-300 hover:text-white transition-colors font-bold"
                >
                  {t('faq')}
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@interdomestik.com"
                  className="text-slate-300 hover:text-white transition-colors font-bold flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  {t('emailUs')}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-slate-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-300 font-medium">
              {t('copyright', { year: new Date().getFullYear(), appName: common('appName') })}
            </p>
            <p className="text-xs text-slate-300 text-center md:text-right max-w-lg font-medium">
              {t('disclaimer')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
