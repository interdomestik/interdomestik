'use client';

import dynamic from 'next/dynamic';
import type { Dispatch, SetStateAction } from 'react';
import {
  BrowserRecoveryDisclosure,
  type BrowserRecoveryDecision,
} from './browser-recovery-disclosure';
import {
  SAVE_AREA_ID,
  SaveAreaClose,
  SecureSaveEntry,
  type SaveEntryCopy,
} from './secure-save-entry';
import type { FreeStartOrganizerProps } from './types';
import type { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';
import type { useDraftLifecycle } from './use-draft-lifecycle';
import type { usePublicSaveArea } from './use-public-save-area';

const SecureSaveBand = dynamic(
  () => import('./secure-save-band').then(module => module.SecureSaveBand),
  { ssr: false }
);

type Props = Readonly<{
  area: ReturnType<typeof usePublicSaveArea>;
  blocked: boolean;
  decision: BrowserRecoveryDecision;
  epoch: number;
  lifecycle: ReturnType<typeof useDraftLifecycle>;
  organizerProps: FreeStartOrganizerProps;
  recovery: ReturnType<typeof useAnonymousDraftRecovery>;
  saveEntryCopy: SaveEntryCopy;
  setDecision: Dispatch<SetStateAction<BrowserRecoveryDecision>>;
}>;

/** Presentation boundary: opening a disclosure never authorizes a storage operation. */
export function PublicSaveOptions({
  area,
  blocked,
  decision,
  epoch,
  lifecycle,
  organizerProps,
  recovery,
  saveEntryCopy,
  setDecision,
}: Props) {
  const {
    saveAvailable,
    saveArea,
    setSaveArea,
    saveAreaRevealed,
    saveAreaCloseable,
    closeSaveArea,
  } = area;
  return (
    <div
      data-testid="free-start-recovery-secure-actions"
      aria-describedby={blocked ? 'anonymous-draft-recovery-heading' : undefined}
      inert={blocked || undefined}
    >
      {saveAreaRevealed ? null : (
        <SecureSaveEntry
          copy={saveEntryCopy}
          deviceCopyKept={['conflict', 'retained', 'saved'].includes(recovery.state)}
          saveAvailable={saveAvailable}
          restoreFocus={saveArea.focus === 'entry' ? saveArea.opener : 'none'}
          onFocusRestored={() => setSaveArea(current => ({ ...current, focus: 'none' }))}
          onOpen={opener => setSaveArea({ focus: 'area', opener, open: true })}
        />
      )}
      {/* Always present so the optional openers control a real element. */}
      <div id={SAVE_AREA_ID} className="space-y-4">
        {saveAreaRevealed ? (
          <>
            {/* prettier-ignore */}
            <SecureSaveBand allowContinuation key={epoch} lifecycle={lifecycle} locale={organizerProps.locale} neutralOtpHost={organizerProps.neutralOtpHost} onVerifiedOwner={organizerProps.onVerifiedOwner} publicPresentation={{ autoFocusHeading: saveArea.focus === 'area', onHeadingFocused: () => setSaveArea(current => ({ ...current, focus: 'none' })), saveAvailable }} tenantId={organizerProps.neutralOtpTenantId} />
            {/* The device-storage choice is a separate optional disclosure here: expanding it
                    only reveals the existing facts, and the explicit enable below them stays the
                    one thing that permits a local write. */}
            {recovery.ready &&
            recovery.neutralHost &&
            !recovery.offer &&
            (recovery.state === 'idle' || recovery.state === 'discarded') ? (
              <BrowserRecoveryDisclosure
                decision={decision}
                onEnable={() => setDecision('enabled')}
                onSkip={() => setDecision('disabled')}
              />
            ) : null}
            {saveAreaCloseable ? (
              <SaveAreaClose label={saveEntryCopy.close} onClose={closeSaveArea} />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
