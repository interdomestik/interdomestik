import * as React from 'react';

import { WizardReview } from '../wizard-review';
import { WizardStepCategory } from '../wizard-step-category';
import { WizardStepDetails } from '../wizard-step-details';
import { WizardStepEvidence } from '../wizard-step-evidence';

export function ClaimWizardStepContent(
  props: Readonly<{ currentStep: number }>
): React.JSX.Element | null {
  const { currentStep } = props;

  if (currentStep === 0) {
    return <WizardStepCategory />;
  }

  if (currentStep === 1) {
    return <WizardStepDetails />;
  }

  if (currentStep === 2) {
    return <WizardStepEvidence />;
  }

  if (currentStep === 3) {
    return <WizardReview />;
  }

  return null;
}
