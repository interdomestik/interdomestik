import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInboundUploadIntent, verifyInboundUploadIntent } from './claim-upload-intent';

const binding = {
  decisionId: '3c7b22a4-d80a-435e-97cb-320d2473279c',
  claimId: 'inbound-case',
  fingerprint: 'a'.repeat(64),
};

beforeEach(() => {
  vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'synthetic-upload-intent-test-secret');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('inbound PDF upload intent', () => {
  it('binds the case, committed decision and file fingerprint', () => {
    const token = createInboundUploadIntent(binding);
    expect(verifyInboundUploadIntent(token, binding.claimId)).toMatchObject(binding);
    expect(verifyInboundUploadIntent(token, 'other-case')).toBeNull();
    const [payload, signature] = token.split('.');
    const changed = Buffer.from(
      Buffer.from(payload, 'base64url').toString().replace(binding.fingerprint, 'b'.repeat(64))
    ).toString('base64url');
    expect(verifyInboundUploadIntent(`${changed}.${signature}`, binding.claimId)).toBeNull();
  });

  it('expires at the intent deadline', () => {
    const token = createInboundUploadIntent(binding);
    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(verifyInboundUploadIntent(token, binding.claimId)).toMatchObject(binding);
    vi.advanceTimersByTime(1);
    expect(verifyInboundUploadIntent(token, binding.claimId)).toBeNull();
  });
});
