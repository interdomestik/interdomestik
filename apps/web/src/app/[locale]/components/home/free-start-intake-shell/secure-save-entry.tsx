'use client';

import { useEffect, useRef, useState } from 'react';

import type { useDraftLifecycle } from './use-draft-lifecycle';

/**
 * Presentation-only entry into the optional save area.
 *
 * Nothing here touches consent, lifecycle intent, storage, OTP or navigation: the two secondary
 * controls only reveal the existing secure-save decision and the existing device-storage choice,
 * so entering facts keeps the review action as the single primary step.
 */
export type SaveEntryCopy = Readonly<{
  close: string;
  heading: string;
  manage: string;
  open: string;
  status: Readonly<Record<'device' | 'neutral', string>>;
}>;

/** Which optional control opened the area, so a deliberate close can return focus to it. */
export type SaveEntryOpener = 'manage' | 'save';
export const SAVE_AREA_ID = 'free-start-save-area';

export function parseSaveEntryCopy(value: unknown): SaveEntryCopy {
  return value as SaveEntryCopy;
}

const NEUTRAL_FRONT_DOORS = new Set([
  'ida.interdomestik.com',
  'ida.localhost',
  'ida.127.0.0.1.nip.io',
]);

export function isNeutralFrontDoor(neutralOtpHost?: string | null): boolean {
  return (
    NEUTRAL_FRONT_DOORS.has(globalThis.location.hostname) ||
    Boolean(neutralOtpHost && globalThis.location.host.toLowerCase() === neutralOtpHost)
  );
}

/** The same client-only host check the band makes, so the shell can place one optional opener. */
export function useNeutralFrontDoor(neutralOtpHost?: string | null): boolean {
  const [neutral, setNeutral] = useState(false);
  // prettier-ignore
  useEffect(() => { setNeutral(isNeutralFrontDoor(neutralOtpHost)); }, [neutralOtpHost]);
  return neutral;
}

/**
 * Any real save work keeps the area open. A pending request, an OTP panel, a failure, a saved
 * receipt or a loaded draft list must never be unmounted by returning to the facts.
 */
export function isSecureSaveEngaged(lifecycle: ReturnType<typeof useDraftLifecycle>): boolean {
  return lifecycle.state !== 'idle' || Boolean(lifecycle.intent) || Boolean(lifecycle.active);
}

const ENTRY_ACTION_CLASS =
  'min-h-11 rounded-xl border border-[#006f72] bg-white px-4 text-base font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2';

/**
 * Only an idle save area collapses to this entry, so a verified-email draft is never summarized
 * here.
 *
 * `deviceCopyKept` is the only positive claim this status may make, and only for the recovery
 * states that actually prove a kept copy. Every other state — unavailable storage, or an idle
 * window where a superseded record may still sit on the device while a replacement write runs —
 * falls back to the neutral line, which asserts nothing about what storage does or does not hold.
 */
type EntryProps = Readonly<{
  copy: SaveEntryCopy;
  deviceCopyKept: boolean;
  saveAvailable: boolean;
  restoreFocus: SaveEntryOpener | 'none';
  onOpen: (opener: SaveEntryOpener) => void;
  onFocusRestored: () => void;
}>;

export function SecureSaveEntry({
  copy,
  deviceCopyKept,
  saveAvailable,
  restoreFocus,
  onOpen,
  onFocusRestored,
}: EntryProps) {
  const saveRef = useRef<HTMLButtonElement>(null);
  const manageRef = useRef<HTMLButtonElement>(null);
  // A deliberate close returns focus to the control that opened the area; first rendering never
  // moves focus at all.
  useEffect(() => {
    if (restoreFocus === 'none') return;
    (restoreFocus === 'save' && saveAvailable ? saveRef : manageRef).current?.focus();
    onFocusRestored();
  }, [restoreFocus, onFocusRestored, saveAvailable]);
  const status = deviceCopyKept ? copy.status.device : copy.status.neutral;

  return (
    <section
      data-testid="free-start-save-entry"
      aria-labelledby="free-start-save-entry-heading"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#001a33]/15 bg-white px-4 py-3 text-[#173b43]"
    >
      <div className="min-w-0">
        <p id="free-start-save-entry-heading" className="text-sm font-bold text-[#001a33]">
          {saveAvailable ? copy.heading : copy.manage}
        </p>
        {saveAvailable || deviceCopyKept ? (
          <p
            data-testid="free-start-save-entry-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="mt-1 text-sm leading-6 text-[#526274]"
          >
            {status}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        {saveAvailable ? (
          <button
            ref={saveRef}
            type="button"
            data-testid="free-start-save-entry-open"
            aria-controls={SAVE_AREA_ID}
            aria-expanded={false}
            onClick={() => onOpen('save')}
            className={ENTRY_ACTION_CLASS}
          >
            {copy.open}
          </button>
        ) : null}
        <button
          ref={manageRef}
          type="button"
          data-testid="free-start-save-entry-manage"
          aria-controls={SAVE_AREA_ID}
          aria-expanded={false}
          onClick={() => onOpen('manage')}
          className={ENTRY_ACTION_CLASS}
        >
          {copy.manage}
        </button>
      </div>
    </section>
  );
}

export function SaveAreaClose({
  label,
  onClose,
}: Readonly<{ label: string; onClose: () => void }>) {
  return (
    <button
      type="button"
      data-testid="free-start-save-close"
      aria-controls={SAVE_AREA_ID}
      aria-expanded
      onClick={onClose}
      className="min-h-11 rounded-lg px-3 text-base font-bold text-[#006b7b] underline decoration-[#008f91]/40 underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
    >
      {label}
    </button>
  );
}
