import type { UseFormReturn } from 'react-hook-form';

import type { CreateClaimValues } from '@/lib/validators/claims';

export const STEP_NAMES = ['category', 'details', 'evidence', 'review'];

export function getClaimWizardDefaultValues(initialCategory?: string): CreateClaimValues {
  return {
    category: initialCategory || '',
    currency: 'EUR',
    files: [],
    title: '',
    companyName: '',
    description: '',
    claimAmount: '',
    incidentDate: '',
  };
}

export const STEP_VALIDATION: Record<
  number,
  (form: UseFormReturn<CreateClaimValues>) => Promise<boolean>
> = {
  0: form => form.trigger('category'),
  1: form => form.trigger(['title', 'companyName', 'description', 'incidentDate']),
  2: async () => true,
};
