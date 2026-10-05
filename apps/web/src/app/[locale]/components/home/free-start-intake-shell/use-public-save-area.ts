import { useEffect, useState } from 'react';

import {
  isSecureSaveEngaged,
  useNeutralFrontDoor,
  type SaveEntryOpener,
} from './secure-save-entry';
import type { CategoryId, StepId } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';

type SaveArea = { focus: 'area' | 'entry' | 'none'; opener: SaveEntryOpener; open: boolean };

/** Presentation only: disclosure state never starts storage, consent or lifecycle requests. */
export function usePublicSaveArea({
  category,
  step,
  lifecycle,
  neutralOtpHost,
}: {
  category: CategoryId | null;
  step: StepId;
  lifecycle: ReturnType<typeof useDraftLifecycle>;
  neutralOtpHost?: string | null;
}) {
  const neutralFrontDoor = useNeutralFrontDoor(neutralOtpHost);
  const saveEngaged = isSecureSaveEngaged(lifecycle);
  const saveAvailable = category === 'vehicle' || category === 'property';
  const reviewingAdmitted = (step === 'preview' || step === 'complete') && saveAvailable;
  const [saveArea, setSaveArea] = useState<SaveArea>({
    focus: 'none',
    opener: 'save',
    open: false,
  });
  useEffect(() => {
    if (saveEngaged)
      setSaveArea(current => (current.open ? current : { ...current, focus: 'none', open: true }));
  }, [saveEngaged]);
  return {
    neutralFrontDoor,
    saveAvailable,
    reviewingAdmitted,
    saveArea,
    setSaveArea,
    saveAreaRevealed: saveArea.open || reviewingAdmitted || !neutralFrontDoor,
    saveAreaCloseable: saveArea.open && !saveEngaged && !reviewingAdmitted,
    closeSaveArea: () => setSaveArea(current => ({ ...current, focus: 'entry', open: false })),
  };
}
