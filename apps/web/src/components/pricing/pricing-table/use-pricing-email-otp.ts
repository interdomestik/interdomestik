'use client';
import { authClient } from '@/lib/auth-client';
import { useEffect, useRef, useState } from 'react';
import type { OtpError, PricingEmailOtpArgs } from './types';
const OTP_LOCALES = ['sq', 'en', 'sr', 'mk'] as const;
function allowlistedLocale(locale: string) {
  return OTP_LOCALES.includes(locale as (typeof OTP_LOCALES)[number]) ? locale : 'en';
}
function maskEmail(email: string) {
  const [name = '', domain = ''] = email.split('@');
  return `${name.slice(0, 1)}${'•'.repeat(Math.min(5, Math.max(1, name.length - 1)))}@${domain}`;
}
export function usePricingEmailOtp(args: PricingEmailOtpArgs) {
  const [email, setEmail] = useState(args.initialEmail ?? '');
  const [code, setCode] = useState('');
  const [lockedEmail, setLockedEmail] = useState<string | null>(null);
  const [error, setError] = useState<OtpError | null>(null);
  const [phase, setPhase] = useState<'editing' | 'sending' | 'sent' | 'verifying'>('editing');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const continuationRef = useRef(false);
  const cooldownEmailRef = useRef<string | null>(null);
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const tick = () => setCooldownSeconds(value => Math.max(0, value - 1));
    const timer = globalThis.setInterval(tick, 1000);
    return () => globalThis.clearInterval(timer);
  }, [cooldownSeconds]);
  const focus = (ref: typeof emailRef) => {
    ref.current?.focus();
    globalThis.requestAnimationFrame(() => ref.current?.focus());
  };
  useEffect(() => {
    if (phase === 'sent' && error) globalThis.setTimeout(() => codeRef.current?.focus());
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
  const failVerification = (nextError: OtpError) => {
    setError(nextError);
    setPhase('sent');
  };
  const verify = async () => {
    if (pendingRef.current || continuationRef.current) return;
    if (!lockedEmail) {
      setError('missingEmail');
      focus(emailRef);
      return;
    }
    if (!code.trim()) {
      failVerification('verify');
      return;
    }
    pendingRef.current = true;
    setPhase('verifying');
    setError(null);
    try {
      const result = await authClient.signIn.emailOtp({
        email: lockedEmail,
        otp: code.trim(),
        ...(args.tenantId ? { tenantClassificationPending: true, tenantId: args.tenantId } : {}),
      });
      if (result.error) {
        const code = (result.error as { code?: string }).code;
        failVerification(code === 'ACCOUNT_STOP' ? 'accountStop' : 'verify');
        return;
      }
      const userId = result.data?.user?.id;
      if (typeof userId !== 'string' || !userId) {
        failVerification('accountStop');
        return;
      }
      continuationRef.current = true;
      try {
        await args.onVerified({ email: lockedEmail, userId });
        setPhase('sent');
      } catch {
        failVerification('accountStop');
      }
    } catch {
      failVerification('verify');
    } finally {
      pendingRef.current = false;
    }
  };
  const changeEmail = () => {
    setEmail('');
    setCode('');
    setLockedEmail(null);
    setError(null);
    setPhase('editing');
    continuationRef.current = false;
    focus(emailRef);
  };
  const reset = () => {
    setEmail(args.initialEmail ?? '');
    setCode('');
    setLockedEmail(null);
    setError(null);
    setPhase('editing');
    continuationRef.current = false;
  };
  const form = { email, setEmail, code, setCode, error, cooldownSeconds, emailRef, codeRef };
  const actions = { send, verify, changeEmail, reset };
  const visibleCooldown =
    lockedEmail || email.trim().toLowerCase() === cooldownEmailRef.current ? cooldownSeconds : 0;
  const hasStatus = lockedEmail && !['accountStop', 'sendFailed'].includes(error ?? '');
  return {
    ...form,
    cooldownSeconds: visibleCooldown,
    destinationLocked: Boolean(lockedEmail),
    maskedEmail: lockedEmail ? maskEmail(lockedEmail) : '',
    status: hasStatus ? ('sent' as const) : null,
    sending: phase === 'sending',
    verifying: phase === 'verifying',
    ...actions,
  };
}
