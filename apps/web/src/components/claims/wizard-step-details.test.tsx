import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WizardStepDetails } from './wizard-step-details';

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    watch: vi.fn().mockReturnValue('vehicle'),
    setValue: vi.fn(),
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Claim Details',
      subtitle: 'Provide information about your claim',
      claim_title: 'Claim Title',
      claim_title_placeholder: 'Enter a title for your claim',
      claim_title_desc: 'A short, descriptive title',
      company: 'Company Name',
      company_placeholder: 'Enter company name',
      amount: 'Claim Amount',
      currency: 'Currency',
      date: 'Incident Date',
      description: 'Description',
      description_placeholder: 'Describe what happened',
      helpfulTips: 'Helpful Tips',
      'vehicle.title': 'Vehicle Claim Details',
      'vehicle.subtitle': 'Provide details about your vehicle incident',
      'vehicle.tips': 'Include photos of damage if available',
      'vehicle.titlePlaceholder': 'E.g., Rear-end collision on Highway 101',
      'vehicle.companyPlaceholder': 'E.g., State Farm Insurance',
      'vehicle.titleDesc': 'Describe your vehicle incident briefly',
      'vehicle.descriptionPlaceholder': 'Describe the incident in detail',
    };
    return translations[key] || key;
  },
}));

// Mock form components
vi.mock('@interdomestik/ui/components/form', () => ({
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  FormField: ({
    render,
    name,
  }: {
    render: (props: { field: Record<string, unknown> }) => React.ReactNode;
    name: string;
  }) => render({ field: { name, value: '', onChange: vi.fn() } }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormMessage: () => null,
}));

vi.mock('@interdomestik/ui/components/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@interdomestik/ui/components/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

describe('WizardStepDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the details step title', () => {
    render(<WizardStepDetails />);
    // With category selected, should show category-specific title
    expect(screen.getByText('Vehicle Claim Details')).toBeInTheDocument();
  });

  it('renders form fields', () => {
    render(<WizardStepDetails />);

    expect(screen.getByText('Claim Title')).toBeInTheDocument();
    expect(screen.getByText('Company Name')).toBeInTheDocument();
    expect(screen.getByText('Claim Amount')).toBeInTheDocument();
    expect(screen.getByText('Currency')).toBeInTheDocument();
    expect(screen.getByText('Incident Date')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('shows helpful tips section', () => {
    render(<WizardStepDetails />);

    expect(screen.getByText('Helpful Tips')).toBeInTheDocument();
  });

  it('renders input fields', () => {
    render(<WizardStepDetails />);

    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
  });
});
