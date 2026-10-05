'use client';

import type { parseSecureSaveCopy } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';

type ActionProps = Readonly<{
  copy: ReturnType<typeof parseSecureSaveCopy>;
  lifecycle: ReturnType<typeof useDraftLifecycle>;
  manageOnly?: boolean;
  saveAvailable: boolean;
  pending: boolean;
}>;

const FILLED_ACTION_CLASS =
  'min-h-11 rounded-xl bg-[#006f72] px-5 text-base font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2';
const OUTLINED_ACTION_CLASS =
  'min-h-11 rounded-xl border border-[#006f72] bg-white px-5 text-base font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]';

const hasSaveableChanges = (lifecycle: ReturnType<typeof useDraftLifecycle>) =>
  ['dirty', 'error'].includes(lifecycle.state) ||
  (lifecycle.state === 'deleted' && lifecycle.hasUnsavedChanges);

export function SecureSavePrimaryActions({
  copy,
  lifecycle,
  manageOnly,
  saveAvailable,
  pending,
  continuationReady,
}: ActionProps & { continuationReady: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {!manageOnly && saveAvailable ? (
        <button
          type="button"
          data-testid="free-start-save-open"
          data-emphasis={continuationReady ? 'secondary' : 'primary'}
          disabled={pending}
          onClick={lifecycle.openSave}
          className={continuationReady ? OUTLINED_ACTION_CLASS : FILLED_ACTION_CLASS}
        >
          {copy.save}
        </button>
      ) : null}
      <button
        type="button"
        data-testid="free-start-manage-open"
        data-emphasis="secondary"
        disabled={pending}
        onClick={lifecycle.openManage}
        className={OUTLINED_ACTION_CLASS}
      >
        {copy.manage.open}
      </button>
    </div>
  );
}

export function SecureSaveActiveActions({
  copy,
  lifecycle,
  manageOnly,
  saveAvailable,
  pending,
}: ActionProps) {
  return (
    <>
      {lifecycle.active ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {saveAvailable && hasSaveableChanges(lifecycle) ? (
            <button
              type="button"
              data-testid="free-start-save-changes"
              disabled={pending}
              onClick={lifecycle.saveChanges}
              className="min-h-11 rounded-xl bg-[#006f72] px-5 font-bold text-white"
            >
              {copy.saveChanges}
            </button>
          ) : null}
          {!manageOnly ? (
            <button
              type="button"
              data-testid="free-start-start-another"
              disabled={pending}
              onClick={lifecycle.startAnother}
              className="min-h-11 rounded-xl border border-[#006f72] bg-white px-5 font-bold text-[#006f72]"
            >
              {copy.startAnother}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
