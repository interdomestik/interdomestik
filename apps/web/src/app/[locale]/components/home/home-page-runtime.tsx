'use client';

import { FunnelLandingTracker } from '@/components/analytics/funnel-trackers';
import { authClient } from '@/lib/auth-client';
import { PUBLIC_FREE_START_ANCHOR_HREF } from '@/lib/public-membership-entry';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getLocaleLandingCore } from '../../_core';
import { getStartClaimHrefForSession } from '../../home-v2.core';
import { FreeStartIntakeShell } from './free-start-intake-shell';
import { HeroSection } from './hero-section';
import { PublicEntrySessionSkeleton } from './public-entry-session-skeleton';

type IntakeOwner = Readonly<{ tenantId: string | null; userId: string | null }>;

/**
 * Decides when a settled session is a different intake owner.
 *
 * An anonymous instance is adopted by the owner who verifies on it, and a tenant claim that only
 * arrives after the user stays the same owner. Another account, a logout, or a tenant that moves
 * away from a known one is a different context and must not inherit the previous owner's state.
 */
function startsNewIntakeInstance(
  previous: IntakeOwner,
  next: IntakeOwner,
  verifiedOwnerId: string | null
): boolean {
  if (previous.userId === null) {
    // A verified save has already bound this instance to one owner, so a different identity
    // settling first is a different context even though no owner has ever settled here.
    return verifiedOwnerId !== null && next.userId !== null && next.userId !== verifiedOwnerId;
  }

  if (previous.userId !== next.userId) {
    return true;
  }

  return previous.tenantId !== null && previous.tenantId !== next.tenantId;
}

type HomePageRuntimeProps = Readonly<{
  defaultPublicTenantId: string;
  locale: string;
  neutralOtpHost: string | null;
  uiV2Enabled: boolean;
}>;

export function HomePageRuntime({
  defaultPublicTenantId,
  locale,
  neutralOtpHost,
  uiV2Enabled,
}: HomePageRuntimeProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [hostTenantId, setHostTenantId] = useState<string | null | undefined>(undefined);
  const redirectedToRef = useRef<string | null>(null);
  const user = (
    session as { user?: { id?: string; role?: string; tenantId?: string | null } } | null
  )?.user;
  const sessionUserId = user?.id ?? null;
  const sessionUserRole = user?.role ?? null;
  const sessionTenantId = user?.tenantId ?? null;
  const [intakeOwner, setIntakeOwner] = useState<IntakeOwner>({
    tenantId: sessionTenantId,
    userId: sessionUserId,
  });
  const [intakeInstance, setIntakeInstance] = useState(0);
  const intakeInstanceRef = useRef(intakeInstance);
  const settledOwnerRef = useRef(intakeOwner.userId);
  const verifiedOwnerRef = useRef<string | null>(null);
  intakeInstanceRef.current = intakeInstance;
  settledOwnerRef.current = intakeOwner.userId;

  const startNextIntakeInstance = () => {
    verifiedOwnerRef.current = null;
    setIntakeInstance(instance => instance + 1);
  };

  /**
   * The intake instance belongs to the settled owner, not to public-entry presentation.
   *
   * A first verification adopts the live instance, so a save already in flight keeps the facts and
   * the receipt it was given. A genuinely changed owner, including a logout, starts a clean
   * instance instead, and a pending refresh decides nothing because it is not a logout.
   */
  if (
    !isPending &&
    (intakeOwner.userId !== sessionUserId || intakeOwner.tenantId !== sessionTenantId)
  ) {
    const settledOwner = { tenantId: sessionTenantId, userId: sessionUserId };
    setIntakeOwner(settledOwner);

    if (startsNewIntakeInstance(intakeOwner, settledOwner, verifiedOwnerRef.current)) {
      startNextIntakeInstance();
    }
  }

  /**
   * Binds the identity a customer just verified to the intake instance it was verified on.
   *
   * This is local UI ownership only and grants no access: the app server stays the fresh authority
   * for every save it accepts. A verification that belongs to a retired instance, or that names
   * anyone other than the identity already settled here, is refused before it can ask to save.
   */
  const onVerifiedOwner = (userId: string): boolean => {
    if (intakeInstance !== intakeInstanceRef.current) {
      return false;
    }

    if (settledOwnerRef.current !== null && settledOwnerRef.current !== userId) {
      startNextIntakeInstance();
      return false;
    }

    verifiedOwnerRef.current = userId;
    return true;
  };

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
  const continueHref = getStartClaimHrefForSession({
    locale,
    session: landingSession,
  });
  const publicHelpNowHref = '/help-now';
  const primaryHref = landingSession === null ? publicHelpNowHref : '/member';
  const secondaryHref = landingSession === null ? PUBLIC_FREE_START_ANCHOR_HREF : continueHref;

  if (isPending) {
    return (
      <>
        <PublicEntrySessionSkeleton />
        <HeroSection
          locale={locale}
          primaryHref={primaryHref}
          secondaryHref={secondaryHref}
          tenantId={tenantId}
        />
        <FreeStartIntakeShell
          key={`intake-${intakeInstance}`}
          continueHref={continueHref}
          locale={locale}
          neutralOtpHost={neutralOtpHost}
          neutralOtpTenantId={defaultPublicTenantId}
          onVerifiedOwner={onVerifiedOwner}
          publicEntryEnabled={landingSession === null}
          tenantId={tenantId}
        />
      </>
    );
  }

  return (
    <>
      {shouldTrackLanding ? (
        <FunnelLandingTracker tenantId={tenantId} locale={locale} uiV2Enabled={uiV2Enabled} />
      ) : null}
      <HeroSection
        locale={locale}
        primaryHref={primaryHref}
        secondaryHref={secondaryHref}
        tenantId={tenantId}
      />
      <FreeStartIntakeShell
        key={`intake-${intakeInstance}`}
        continueHref={continueHref}
        locale={locale}
        neutralOtpHost={neutralOtpHost}
        neutralOtpTenantId={defaultPublicTenantId}
        onVerifiedOwner={onVerifiedOwner}
        publicEntryEnabled={landingSession === null}
        tenantId={tenantId}
      />
    </>
  );
}
