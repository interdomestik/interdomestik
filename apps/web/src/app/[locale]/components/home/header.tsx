'use client';

import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { Menu, MessageCircle, Phone, Shield, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function Header() {
  const t = useTranslations('nav');
  const common = useTranslations('common');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: t('home') },
    { href: '/pricing', label: t('pricing') },
    { href: '/about', label: t('about') },
    { href: '/faq', label: 'FAQ' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="h-18 flex items-center justify-between py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20 group-hover:shadow-lg group-hover:shadow-primary/30 transition-shadow">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-display text-lg font-black text-slate-900">
                {common('appName')}
              </span>
              <p className="text-[10px] text-slate-400 font-medium -mt-0.5">Protection Club</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-slate-600 hover:text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            {whatsapp && (
              <a
                href={whatsapp}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-green-600 hover:bg-green-50 transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="hidden lg:inline">WhatsApp</span>
              </a>
            )}
            {telHref && (
              <a
                href={telHref}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Phone className="h-4 w-4" />
                <span className="hidden lg:inline">{phone}</span>
              </a>
            )}
            <div className="w-px h-6 bg-slate-200 mx-1" />
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className="font-semibold text-slate-600 hover:text-primary"
              >
                {t('login')}
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm" className="font-bold shadow-md shadow-primary/20">
                {t('register')}
              </Button>
            </Link>
          </div>

          {/* Mobile Actions */}
          <div className="flex md:hidden items-center gap-2">
            {telHref && (
              <a
                href={telHref}
                className="flex items-center justify-center h-10 w-10 rounded-xl bg-green-500 text-white shadow-md"
              >
                <Phone className="h-5 w-5" />
                <span className="sr-only">{phone}</span>
              </a>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-slate-100 text-slate-600"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-100 py-4 animate-fade-in">
            <nav className="flex flex-col gap-2 mb-4">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-4 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-2 px-4">
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full font-semibold">
                  {t('login')}
                </Button>
              </Link>
              <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full font-bold shadow-md shadow-primary/20">
                  {t('register')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
