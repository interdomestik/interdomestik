'use client';

import { FunnelLandingTracker } from '@/components/analytics/funnel-trackers';
import { authClient } from '@/lib/auth-client';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getLocaleLandingCore } from '../../_core';
import { getStartClaimHrefForSession } from '../../home-v2.core';
import { HeroV2 } from './hero-v2';

type HomePageRuntimeProps = {
  locale: string;
  uiV2Enabled: boolean;
};

type LandingSession = {
  userId?: string;
  role?: string;
  tenantId?: string | null;
} | null;

function toLandingSession(session: unknown): LandingSession {
  const user = (session as { user?: { id?: string; role?: string; tenantId?: string | null } })
    ?.user;

  if (!user?.id) {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId ?? null,
  };
}

export function HomePageRuntime({ locale, uiV2Enabled }: HomePageRuntimeProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [hostTenantId, setHostTenantId] = useState<string | null>(null);

  useEffect(() => {
    setHostTenantId(resolveTenantFromHost(window.location.host));
  }, []);

  const landingSession = toLandingSession(session);

  useEffect(() => {
    if (uiV2Enabled) {
      return;
    }

    const decision = getLocaleLandingCore({
      locale,
      session: landingSession ? { userId: landingSession.userId, role: landingSession.role } : null,
    });

    if (decision.kind === 'redirect') {
      router.replace(decision.destination);
    }
  }, [landingSession, locale, router, uiV2Enabled]);

  if (!uiV2Enabled) {
    return null;
  }

  const tenantId = landingSession?.tenantId ?? hostTenantId ?? null;
  const startClaimHref = getStartClaimHrefForSession({
    locale,
    session: landingSession ? { userId: landingSession.userId, role: landingSession.role } : null,
  });

  return (
    <>
      <FunnelLandingTracker tenantId={tenantId} locale={locale} uiV2Enabled={uiV2Enabled} />
      <HeroV2 locale={locale} startClaimHref={startClaimHref} tenantId={tenantId} />
    </>
  );
}
