'use client';

import { FunnelLandingTracker } from '@/components/analytics/funnel-trackers';
import { authClient } from '@/lib/auth-client';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getLocaleLandingCore } from '../../_core';
import { getStartClaimHrefForSession } from '../../home-v2.core';
import { HeroV2 } from './hero-v2';

type HomePageRuntimeProps = Readonly<{
  locale: string;
  uiV2Enabled: boolean;
}>;

export function HomePageRuntime({ locale, uiV2Enabled }: HomePageRuntimeProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [hostTenantId, setHostTenantId] = useState<string | null | undefined>(undefined);
  const redirectedToRef = useRef<string | null>(null);
  const user = (
    session as { user?: { id?: string; role?: string; tenantId?: string | null } } | null
  )?.user;
  const sessionUserId = user?.id ?? null;
  const sessionUserRole = user?.role ?? null;
  const sessionTenantId = user?.tenantId ?? null;

  useEffect(() => {
    setHostTenantId(resolveTenantFromHost(globalThis.location.host));
  }, []);
  const landingSession =
    sessionUserId === null
      ? null
      : {
          userId: sessionUserId,
          role: sessionUserRole ?? undefined,
        };

  useEffect(() => {
    if (uiV2Enabled) {
      return;
    }

    const decision = getLocaleLandingCore({
      locale,
      session:
        sessionUserId === null
          ? null
          : { userId: sessionUserId, role: sessionUserRole ?? undefined },
    });

    if (decision.kind === 'redirect' && redirectedToRef.current !== decision.destination) {
      redirectedToRef.current = decision.destination;
      router.replace(decision.destination);
    }
  }, [locale, router, sessionUserId, sessionUserRole, uiV2Enabled]);

  if (!uiV2Enabled) {
    return null;
  }

  const tenantId = sessionTenantId ?? hostTenantId ?? null;
  const shouldTrackLanding = sessionTenantId !== null || hostTenantId !== undefined;
  const startClaimHref = getStartClaimHrefForSession({
    locale,
    session: landingSession,
  });

  return (
    <>
      {shouldTrackLanding ? (
        <FunnelLandingTracker tenantId={tenantId} locale={locale} uiV2Enabled={uiV2Enabled} />
      ) : null}
      <HeroV2 locale={locale} startClaimHref={startClaimHref} tenantId={tenantId} />
    </>
  );
}
