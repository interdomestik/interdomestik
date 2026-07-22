'use client';
import { useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { buildEmailOnboardingPayload } from './register-onboarding-payload';
export type NeutralEmailOtpError = 'missingEmail' | 'sendFailed' | 'verify' | 'accountStop';
type VerifiedIdentity = { email: string; userId: string };
// prettier-ignore
type NeutralEmailOtpArgs = Readonly<{ initialEmail?: string; locale: string; onVerified: (identity: VerifiedIdentity) => Promise<void>; retryVerifiedIntent?: boolean; tenantId?: string | null }>;
const allowlistedLocale = (locale: string) =>
  ['sq', 'en', 'sr', 'mk'].includes(locale) ? locale : 'en';
function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}${'•'.repeat(Math.min(5, Math.max(1, name.length - 1)))}@${domain}`;
}
export function useNeutralEmailOtp(args: NeutralEmailOtpArgs) {
  const [email, setEmail] = useState(args.initialEmail ?? '');
  const [code, setCode] = useState('');
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);
  const [error, setError] = useState<NeutralEmailOtpError | null>(null);
  const [phase, setPhase] = useState<'editing' | 'sending' | 'sent' | 'verifying'>('editing');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [emailRef, codeRef] = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const pendingRef = useRef(false);
  const continuationRef = useRef(false);
  const cooldownEmailRef = useRef<string | null>(null);
  const verifiedIdentityRef = useRef<VerifiedIdentity | null>(null);
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const tick = () => setCooldownSeconds(value => Math.max(0, value - 1));
    const timer = globalThis.setInterval(tick, 1000);
    return () => globalThis.clearInterval(timer);
  }, [cooldownSeconds]);
  const focus = (ref: typeof emailRef) => {
    ref.current?.focus();
    globalThis.requestAnimationFrame?.(() => ref.current?.focus());
  };
  useEffect(() => {
    const timer =
      phase === 'sent' && error ? globalThis.setTimeout(() => codeRef.current?.focus()) : 0;
    return () => globalThis.clearTimeout(timer);
  }, [error, phase]);
  const send = async () => {
    if (pendingRef.current) return;
    const destination = (lockedEmail ?? email).trim().toLowerCase();
    if (!destination) {
      setError('missingEmail');
      focus(emailRef);
      return;
    }
    if (cooldownSeconds > 0 && destination === cooldownEmailRef.current) return;
    const wasLocked = Boolean(lockedEmail);
    pendingRef.current = true;
    setPhase('sending');
    setError(null);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp(
        { email: destination, type: 'sign-in' },
        { headers: { 'x-interdomestik-locale': allowlistedLocale(args.locale) } }
      );
      if (result.error) throw new Error('otp_send_failed');
      setEmail(destination);
      setLockedEmail(destination);
      cooldownEmailRef.current = destination;
      setCooldownSeconds(60);
      setPhase('sent');
      if (!wasLocked) focus(codeRef);
    } catch {
      setError('sendFailed');
      setPhase(wasLocked ? 'sent' : 'editing');
      if (!wasLocked) focus(emailRef);
    } finally {
      pendingRef.current = false;
    }
  };
  const failVerification = (nextError: NeutralEmailOtpError) => {
    setError(nextError);
    setPhase('sent');
  };
  const continueVerified = async (identity: VerifiedIdentity) => {
    continuationRef.current = true;
    try {
      await args.onVerified(identity);
      setError(null);
      setPhase('sent');
    } catch {
      if (args.retryVerifiedIntent) continuationRef.current = false;
      failVerification('accountStop');
    }
  };
  const verify = async () => {
    if (pendingRef.current || continuationRef.current) return;
    if (verifiedIdentityRef.current) {
      setPhase('verifying');
      setError(null);
      await continueVerified(verifiedIdentityRef.current);
      return;
    }
    if (!lockedEmail) {
      setError('missingEmail');
      focus(emailRef);
      return;
    }
    if (!code.trim()) return failVerification('verify');
    pendingRef.current = true;
    setPhase('verifying');
    setError(null);
    try {
      const result = await authClient.signIn.emailOtp({
        email: lockedEmail,
        otp: code.trim(),
        ...(args.tenantId ? buildEmailOnboardingPayload(args.tenantId, true) : {}),
      });
      if (result.error) {
        const providerCode = (result.error as { code?: string }).code;
        failVerification(providerCode === 'ACCOUNT_STOP' ? 'accountStop' : 'verify');
        return;
      }
      const userId = result.data?.user?.id;
      if (typeof userId !== 'string' || !userId) return failVerification('accountStop');
      verifiedIdentityRef.current = { email: lockedEmail, userId };
      await continueVerified(verifiedIdentityRef.current);
    } catch {
      failVerification('verify');
    } finally {
      pendingRef.current = false;
    }
  };
  const clear = (nextEmail: string) => {
    setEmail(nextEmail);
    setCode('');
    setLockedEmail(null);
    setError(null);
    setPhase('editing');
    continuationRef.current = false;
    verifiedIdentityRef.current = null;
  };
  const changeEmail = () => {
    clear('');
    focus(emailRef);
  };
  const reset = () => clear(args.initialEmail ?? '');
  const visibleCooldown =
    lockedEmail || email.trim().toLowerCase() === cooldownEmailRef.current ? cooldownSeconds : 0;
  const hasStatus = lockedEmail && !['accountStop', 'sendFailed'].includes(error ?? '');
  const form = { email, setEmail, code, setCode, error, emailRef, codeRef };
  const actions = { send, verify, changeEmail, reset };
  // prettier-ignore
  return { ...form, cooldownSeconds: visibleCooldown, destinationLocked: Boolean(lockedEmail), maskedEmail: lockedEmail ? maskEmail(lockedEmail) : '', status: hasStatus ? ('sent' as const) : null, sending: phase === 'sending', verifying: phase === 'verifying', ...actions };
}
