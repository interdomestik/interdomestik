import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import enPricing from '../../../messages/en/pricing.json';
import mkPricing from '../../../messages/mk/pricing.json';
import sqPricing from '../../../messages/sq/pricing.json';
import srPricing from '../../../messages/sr/pricing.json';
import { OtpCheckoutStep } from './otp-checkout-step';

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('lucide-react', () => ({ Loader2: (props: object) => <span {...props}>loading</span> }));

const copy: Record<string, string> = {
  joinSecurely: 'Email check',
  'otpStep.title': 'Confirm your email to continue',
  'otpStep.truth':
    'We’ll send a 6-digit code. The code confirms your email and opens or creates your account. It does not confirm payment, active membership, a claim, or an accepted case.',
  'otpStep.emailLabel': 'Email',
  'otpStep.send': 'Send code',
  'otpStep.sent': 'If that address can receive email from us, a code is on its way.',
  'otpStep.codeLabel': '6-digit code',
  'otpStep.verify': 'Confirm email',
  'otpStep.changeEmail': 'Change email',
  'otpStep.resend': 'Send a new code',
  'preCheckout.cancel': 'Back',
  'disclaimers.hotline.title': 'Contact support',
  'otpStep.errors.verify': 'We couldn’t confirm that code.',
};
const t = (key: string, values?: Record<string, string | number | Date>) =>
  key === 'otpStep.resendCooldown' ? `Send a new code in ${values?.seconds}s` : (copy[key] ?? key);
const baseProps = {
  email: 'member@example.com',
  maskedEmail: 'm•••••@example.com',
  code: '',
  destinationLocked: false,
  error: null,
  status: null,
  cooldownSeconds: 0,
  sending: false,
  verifying: false,
  emailRef: createRef<HTMLInputElement>(),
  codeRef: createRef<HTMLInputElement>(),
  t,
  onEmailChange: vi.fn(),
  onCodeChange: vi.fn(),
  onSend: vi.fn(),
  onBack: vi.fn(),
  onVerify: vi.fn(),
  onChangeEmail: vi.fn(),
  onResend: vi.fn(),
};

function renderStep(overrides: Record<string, unknown> = {}) {
  return render(<OtpCheckoutStep {...baseProps} {...overrides} />);
}

describe('OtpCheckoutStep neutral truth and recovery', () => {
  it.each([
    ['sq', sqPricing.pricing],
    ['en', enPricing.pricing],
    ['sr', srPricing.pricing],
    ['mk', mkPricing.pricing],
  ])(
    '%s states that email confirmation is not payment, membership, claim, or case acceptance',
    (_locale, pricingCopy) => {
      const otpCopy = pricingCopy.otpStep;
      renderStep({
        t: (key: string) =>
          key === 'joinSecurely'
            ? pricingCopy.joinSecurely
            : (otpCopy[key.replace('otpStep.', '') as keyof typeof otpCopy] as string),
      });
      expect(screen.getByText(pricingCopy.joinSecurely)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: otpCopy.title })).toBeInTheDocument();
      expect(screen.getByText(otpCopy.truth)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: otpCopy.send })).toBeInTheDocument();
    }
  );

  it('uses explicit labels, autocomplete, descriptions, and paste-friendly numeric input', () => {
    const { rerender } = renderStep({ error: 'missingEmail' });
    const email = screen.getByLabelText('Email');
    expect(screen.getByLabelText('6-digit code')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
    rerender(<OtpCheckoutStep {...baseProps} destinationLocked status="sent" error="verify" />);
    const code = screen.getByLabelText('6-digit code');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(code).toHaveAttribute('aria-describedby', expect.stringContaining('otp-error'));
    expect(code).toHaveAttribute('aria-describedby', expect.stringContaining('otp-status'));
  });

  it('locks and masks a successfully sent destination until Change email is chosen', async () => {
    const onChangeEmail = vi.fn();
    renderStep({ destinationLocked: true, status: 'sent', onChangeEmail });
    expect(screen.queryByDisplayValue('member@example.com')).not.toBeInTheDocument();
    expect(screen.getByText('m•••••@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change email' }));
    expect(onChangeEmail).toHaveBeenCalledOnce();
  });

  it('announces send status politely and verification failure assertively once', () => {
    renderStep({ destinationLocked: true, status: 'sent', error: 'verify' });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t confirm that code.');
  });

  it('mutually locks ordinary send and verify submissions while pending', () => {
    renderStep({ destinationLocked: true, status: 'sent', sending: true });
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send a new code' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Confirm email' })).toBeDisabled();
    expect(screen.getByText('loading')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('loading')).toHaveClass('motion-reduce:animate-none');
  });

  it('offers cooldown, resend, back, and support recovery with 44px actions', () => {
    const { rerender } = renderStep({
      destinationLocked: true,
      status: 'sent',
      error: 'verify',
      cooldownSeconds: 27,
    });
    expect(screen.getByRole('button', { name: 'Send a new code in 27s' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^tel:/)
    );
    rerender(<OtpCheckoutStep {...baseProps} destinationLocked error="accountStop" />);
    expect(screen.getByRole('button', { name: 'Confirm email' })).toBeDisabled();
  });
});
