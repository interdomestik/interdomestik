'use client';

import { Button } from '@interdomestik/ui';
import { Download, Share } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { isPwaEnabled } from '@/lib/pwa/registration';

interface PwaInstallButtonProps {
  readonly label?: string;
  readonly className?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallButton({ label, className }: PwaInstallButtonProps) {
  const t = useTranslations('common.pwa');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!isPwaEnabled()) return;
    setMounted(true);
    const mode = window.matchMedia('(display-mode: standalone)');
    const iosNavigator = navigator as Navigator & { standalone?: boolean };
    setIsStandalone(mode.matches || iosNavigator.standalone === true);
    setIsIOS(
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
    const prompt = (event: Event): void => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const installed = (): void => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };
    const modeChanged = (event: MediaQueryListEvent): void => setIsStandalone(event.matches);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    mode.addEventListener('change', modeChanged);
    return () => {
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      mode.removeEventListener('change', modeChanged);
    };
  }, []);

  const handleInstall = async (): Promise<void> => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    // Each browser prompt can be used only once, including after dismissal or failure.
    setDeferredPrompt(null);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') setIsStandalone(true);
    } catch {
      // A later browser event may supply a new prompt.
    }
  };

  if (!mounted || isStandalone) return null;
  if (isIOS) {
    return (
      <div className={`mt-4 p-4 bg-secondary/50 rounded-lg text-sm text-center ${className ?? ''}`}>
        <p className="font-medium mb-2">{t('iosTitle')}</p>
        <p className="flex items-center justify-center gap-2">
          <Share aria-hidden="true" className="h-4 w-4" />
          {t('iosInstructions')}
        </p>
      </div>
    );
  }
  if (!deferredPrompt) return null;
  return (
    <Button
      onClick={handleInstall}
      variant="outline"
      className={`w-full h-12 shadow-sm ${className ?? ''}`}
    >
      <Download aria-hidden="true" className="mr-2 h-5 w-5" />
      {label ?? t('install')}
    </Button>
  );
}
