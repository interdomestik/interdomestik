import { providerField } from '../delivery-outcome';

/** Classifies failures without including SQL, parameters or provider response bodies. */
export function describePublicReplyFailure(error: unknown): { name: string; code?: string } {
  const name = providerField(error, 'name');
  const code = providerField(error, 'code') ?? providerField(providerField(error, 'cause'), 'code');
  const fallbackName = error instanceof Error ? 'Error' : 'UnknownError';
  return {
    name:
      typeof name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(name) ? name : fallbackName,
    ...(typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code) ? { code } : {}),
  };
}
