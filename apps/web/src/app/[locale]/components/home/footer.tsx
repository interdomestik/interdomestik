import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { MessageCircle, Phone, Shield, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  const common = useTranslations('common');
  const hero = useTranslations('hero');
  const { phone, whatsapp, address, hours } = contactInfo;

  return (
    <footer className="bg-[hsl(var(--muted-900))] text-white py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-6 w-6 text-[hsl(var(--primary))]" />
              <span className="font-display font-bold">{common('appName')}</span>
            </div>
            <p className="text-sm text-white/70 mb-4">{t('description')}</p>

            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[hsl(var(--primary))/0.15] border border-[hsl(var(--primary))/0.3] text-[hsl(var(--primary-foreground))] text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              {hero('noWinNoFee')}
            </div>

            <div className="space-y-2 text-sm">
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  className="flex items-center gap-2 text-white hover:text-[hsl(var(--primary))] transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  {phone}
                </a>
              )}
              {whatsapp && (
                <a
                  href={whatsapp}
                  className="flex items-center gap-2 text-white hover:text-[hsl(var(--success))] transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              {address && (
                <p className="flex items-center gap-2 text-white/80">
                  <Shield className="h-4 w-4" />
                  {address}
                </p>
              )}
              {hours && <p className="text-white/60 text-xs">{t('hours', { hours })}</p>}
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t('company')}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  {t('about')}
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-white transition-colors">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-white transition-colors">
                  {t('careers')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t('legal')}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  {t('privacy')}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  {t('terms')}
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="hover:text-white transition-colors">
                  {t('cookies')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t('support')}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li>
                <Link href="/help" className="hover:text-white transition-colors">
                  {t('help')}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  {t('contact')}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-white transition-colors">
                  {t('faq')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-white/60">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
          <p className="text-xs text-white/40">{t('disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}
