import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Mail, MapPin, MessageCircle, Phone, Shield, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  const common = useTranslations('common');
  const hero = useTranslations('hero');
  const { phone, whatsapp, address, hours } = contactInfo;

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
                <p className="text-xs text-slate-400 font-medium">Membership Protection Club</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-sm">
              {t('description')}
            </p>

            {/* Trust Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold mb-8">
              <ShieldCheck className="h-4 w-4" />
              {hero('noWinNoFee')}
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  className="flex items-center gap-3 text-white hover:text-primary transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold">{phone}</p>
                    <p className="text-xs text-slate-500">24/7 Hotline</p>
                  </div>
                </a>
              )}
              {whatsapp && (
                <a
                  href={whatsapp}
                  className="flex items-center gap-3 text-white hover:text-green-400 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center group-hover:bg-green-500/10 transition-colors">
                    <MessageCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="font-bold">WhatsApp</p>
                    <p className="text-xs text-slate-500">Chat with us</p>
                  </div>
                </a>
              )}
              {address && (
                <div className="flex items-center gap-3 text-slate-400">
                  <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{address}</p>
                    {hours && <p className="text-xs text-slate-500">{hours}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Membership Links */}
          <div>
            <h4 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300 mb-6">
              Membership
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/pricing"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  Plans & Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/register"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  Join the Club
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  Member Login
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  {t('about')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300 mb-6">
              {t('legal')}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  {t('privacy')}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/terms"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  {t('terms')}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/cookies"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  {t('cookies')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h4 className="font-display font-bold text-sm uppercase tracking-wider text-slate-300 mb-6">
              {t('support')}
            </h4>
            <ul className="space-y-3 text-sm">
              <li>
                <Link
                  href="/help"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  {t('help')}
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-slate-400 hover:text-white transition-colors font-medium"
                >
                  {t('faq')}
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:support@interdomestik.com`}
                  className="text-slate-400 hover:text-white transition-colors font-medium flex items-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  Email Us
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
            <p className="text-sm text-slate-500">
              {t('copyright', { year: new Date().getFullYear() })}
            </p>
            <p className="text-xs text-slate-600 text-center md:text-right max-w-lg">
              {t('disclaimer')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
