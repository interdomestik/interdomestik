import { acceptanceMocks } from './member-acceptance-denial.test-support';
import { describe, expect, it, vi } from 'vitest';
import { createClaim, updateDraftClaim } from '@/actions/claims';
import { submitClaim } from '@/actions/claims.core';
import { createPublicTrackingLink } from '@/actions/claims-tracking';
import { getAgents, getStaff, getUserChoices, getUsers } from '@/actions/admin-users';
import { getAgentSettings } from '@/actions/agent-settings';
import { getCountryGuidanceAction } from '@/actions/country-guidance';
import { uploadVoiceNote } from '@/actions/uploads/upload';
import { confirmUpload, generateUploadUrl } from '@/features/member/claims/actions';

const effects = vi.hoisted(() => ({
  createClaim: vi.fn(),
  updateDraft: vi.fn(),
  submit: vi.fn(),
  tracking: vi.fn(),
  country: vi.fn(),
  voiceNote: vi.fn(),
  claimAccess: vi.fn(),
  requestAccess: vi.fn(),
  directory: vi.fn(),
  agentSettings: vi.fn(),
}));

vi.mock('@/actions/admin-users/get-users', () => ({ getUsersCore: effects.directory }));
vi.mock('@/actions/agent-settings/get', () => ({ getAgentSettingsCore: effects.agentSettings }));
vi.mock('@/actions/claims/create', () => ({ createClaimCore: effects.createClaim }));
vi.mock('@/actions/claims/draft', () => ({ updateDraftClaimCore: effects.updateDraft }));
vi.mock('@/actions/claims/submit', () => ({ submitClaimCore: effects.submit }));
vi.mock('@/actions/uploads/voice-note-storage', () => ({ uploadToStorage: effects.voiceNote }));
vi.mock('@/features/claims/upload/server/access', () => ({
  findOwnedMemberUploadClaim: effects.claimAccess,
  findOwnedMemberInformationRequest: effects.requestAccess,
}));
vi.mock('@/features/claims/tracking/server/createPublicTrackingLink', () => ({
  createPublicTrackingLink: effects.tracking,
}));
vi.mock('@interdomestik/domain-country-guidance', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-country-guidance')>()),
  countryGuidanceService: { getGuidance: effects.country },
}));

const claim = {
  category: 'vehicle',
  companyName: 'Fixture company',
  currency: 'EUR',
  description: 'Synthetic fixture claim',
  files: [],
  incidentDate: '2026-01-01',
  title: 'Fixture claim',
} as const;
const draft = { ...claim, files: [] };
const id = '00000000-0000-4000-8000-000000000001';

describe('direct member actions', () => {
  it.each([
    ['getUsers', () => getUsers({})],
    ['getUserChoices', () => getUserChoices({})],
    ['getAgents', () => getAgents()],
    ['getStaff', () => getStaff()],
    ['getAgentSettings', () => getAgentSettings(id)],
    ['createClaim', () => createClaim(null, new FormData())],
    ['submitClaim', () => submitClaim(draft)],
    ['updateDraftClaim', () => updateDraftClaim(id, draft)],
    ['createPublicTrackingLink', () => createPublicTrackingLink(id)],
    [
      'getCountryGuidanceAction',
      () => getCountryGuidanceAction({ countryCode: 'DE', language: 'en' }),
    ],
    ['uploadVoiceNote', () => uploadVoiceNote(new FormData())],
    ['generateUploadUrl', () => generateUploadUrl(id, 'fixture.pdf', 'application/pdf', 10)],
    [
      'confirmUpload',
      () =>
        confirmUpload({
          claimId: id,
          fileId: id,
          storagePath: 'fixture.pdf',
          originalName: 'fixture.pdf',
          fileSize: 10,
          mimeType: 'application/pdf',
          uploadIntentToken: 'fixture',
        }),
    ],
  ] as const)('%s refuses before protected work', async (_name, invoke) => {
    const result = await invoke();
    expect(result).toMatchObject({ success: false });
    expect('code' in result ? result.code : 'error' in result && result.error).toBe(
      'acceptance_required'
    );
    expect(acceptanceMocks.readAcceptance).toHaveBeenCalledOnce();
    for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
  });
});
