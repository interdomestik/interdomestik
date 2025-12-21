'use client';

import { Button } from '@interdomestik/ui';
import { Download, Share } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PwaInstallButtonProps {
  label?: string;
  className?: string;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaInstallButton({ label = 'Install App', className }: PwaInstallButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
    }

    // Detect iOS
    const userAgent = window.navigator.userAgent;
    const isIosDevice = /iPhone|iPad|iPod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Initial check for deferred prompt (if event fired before hydration)
    // Note: 'beforeinstallprompt' is not standard on all browsers yet
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  if (!mounted || isStandalone) return null;

  // iOS Instructions
  if (isIOS) {
    return (
      <div className={`mt-4 p-4 bg-secondary/50 rounded-lg text-sm text-center ${className}`}>
        <p className="font-medium mb-2">Install for better experience:</p>
        <p className="flex items-center justify-center gap-2">
          Tap <Share className="h-4 w-4" /> then <strong>Add to Home Screen</strong>
        </p>
      </div>
    );
  }

  // Android / Desktop Chrome PWA Prompt
  if (deferredPrompt) {
    return (
      <Button
        onClick={handleInstall}
        variant="outline"
        className={`w-full h-12 shadow-sm ${className}`}
      >
        <Download className="mr-2 h-5 w-5" />
        {label}
      </Button>
    );
  }

  return null;
}
