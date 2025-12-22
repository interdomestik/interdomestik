import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WizardStepCategory } from './wizard-step-category';

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

// Mock flags
vi.mock('@/lib/flags', () => ({
  flags: {
    callMeNow: false,
  },
}));

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useFormContext: () => ({
    control: {},
    setValue: vi.fn(),
    watch: vi.fn().mockReturnValue(undefined),
  }),
  Controller: ({
    render: r,
  }: {
    render: (props: { field: { onChange: () => void; value: string } }) => React.ReactNode;
  }) => r({ field: { onChange: vi.fn(), value: '' } }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'What type of claim is this?',
      subtitle: 'Select the category that best describes your situation',
      startClaim: 'Start your claim today',
      quickSelectLabel: 'Quick select common claims:',
      'vehicle.title': 'Vehicle',
      'vehicle.description': 'Car accidents, damage, theft',
      'vehicle.examples': 'Collision, vandalism, stolen car',
      'property.title': 'Property',
      'property.description': 'Home, rental, business property',
      'property.examples': 'Water damage, fire, theft',
      'injury.title': 'Personal Injury',
      'injury.description': 'Workplace, medical, accidents',
      'injury.examples': 'Slip and fall, medical malpractice',
      'travel.title': 'Travel',
      'travel.description': 'Flight delays, lost luggage',
      'travel.examples': 'Cancelled flights, delayed flights',
      flight_delay: 'Flight Delay',
      car_accident: 'Car Accident',
      water_damage: 'Water Damage',
      workplace_injury: 'Workplace Injury',
      theft: 'Theft',
      medical_malpractice: 'Medical Malpractice',
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock('@interdomestik/ui/components/badge', () => ({
  Badge: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { children: React.ReactNode }) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@interdomestik/ui/components/form', () => ({
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({ render }: { render: (props: { field: { value: string } }) => React.ReactNode }) =>
    render({ field: { value: '' } }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormMessage: () => null,
}));

vi.mock('@interdomestik/ui/components/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('WizardStepCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders category selection title', () => {
    render(<WizardStepCategory />);

    expect(screen.getByText('What type of claim is this?')).toBeInTheDocument();
    expect(
      screen.getByText('Select the category that best describes your situation')
    ).toBeInTheDocument();
  });

  it('renders all main category cards', () => {
    render(<WizardStepCategory />);

    expect(screen.getByText('Vehicle')).toBeInTheDocument();
    expect(screen.getByText('Property')).toBeInTheDocument();
    expect(screen.getByText('Personal Injury')).toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
  });

  it('renders category descriptions', () => {
    render(<WizardStepCategory />);

    expect(screen.getByText('Car accidents, damage, theft')).toBeInTheDocument();
    expect(screen.getByText('Home, rental, business property')).toBeInTheDocument();
  });

  it('renders quick select tags section', () => {
    render(<WizardStepCategory />);

    expect(screen.getByText('Quick select common claims:')).toBeInTheDocument();
    expect(screen.getByText('Flight Delay')).toBeInTheDocument();
    expect(screen.getByText('Car Accident')).toBeInTheDocument();
  });

  it('renders all quick select tags', () => {
    render(<WizardStepCategory />);

    expect(screen.getByText('Water Damage')).toBeInTheDocument();
    expect(screen.getByText('Workplace Injury')).toBeInTheDocument();
    expect(screen.getByText('Theft')).toBeInTheDocument();
    expect(screen.getByText('Medical Malpractice')).toBeInTheDocument();
  });

  it('has data-testid for category cards', () => {
    render(<WizardStepCategory />);

    expect(screen.getByTestId('category-vehicle')).toBeInTheDocument();
    expect(screen.getByTestId('category-property')).toBeInTheDocument();
    expect(screen.getByTestId('category-injury')).toBeInTheDocument();
    expect(screen.getByTestId('category-travel')).toBeInTheDocument();
  });
});
