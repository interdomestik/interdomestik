import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { MessageCircle, Phone, Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function Header() {
  const t = useTranslations('nav');
  const common = useTranslations('common');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <header className="sticky top-0 z-50 glass-card border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-[hsl(var(--primary))]" />
          <span className="font-display text-xl font-bold">{common('appName')}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('home')}
          </Link>
          <Link
            href="/services"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            Services
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('pricing')}
          </Link>
          <Link
            href="/contact"
            className="text-sm font-medium hover:text-[hsl(var(--primary))] transition-colors"
          >
            {t('contact')}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {telHref && (
            <a
              href={telHref}
              className="md:hidden flex items-center justify-center h-9 w-9 rounded-full bg-[hsl(var(--success))] text-white"
            >
              <Phone className="h-4 w-4" />
              <span className="sr-only">{phone}</span>
            </a>
          )}
          {whatsapp && (
            <a
              href={whatsapp}
              className="md:hidden flex items-center justify-center h-9 w-9 rounded-full bg-[hsl(var(--primary))] text-white"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="sr-only">WhatsApp</span>
            </a>
          )}
          <Link href="/login">
            <Button variant="ghost" size="sm">
              {t('login')}
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm">{t('register')}</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
