export type ClaimWizardProps = {
  initialCategory?: string;
  tenantId?: string | null;
  handoffContext?: {
    source: 'diaspora-green-card';
    country: 'DE' | 'CH' | 'AT' | 'IT';
    incidentLocation: 'abroad';
  } | null;
};

export type ClaimWizardReadonlyProps = Readonly<ClaimWizardProps>;

export type ClaimWizardHandoffContext = NonNullable<ClaimWizardProps['handoffContext']>;

export type ClaimWizardStep = {
  id: string;
  title: string;
};
