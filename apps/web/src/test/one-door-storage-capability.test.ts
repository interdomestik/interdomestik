import { describe, expect, it } from 'vitest';
import { doorStorageCapability } from '../../e2e/fixtures/one-door-storage-capability';

const configured: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PW_EXTERNAL_SERVER: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://storage.example.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
};

describe('one-door storage proof capability', () => {
  it('qualifies bytes only with real storage configuration', () => {
    expect(doorStorageCapability(configured)).toBe('real-storage');
  });
  it('limits the managed local PR server to fallback-signing evidence', () => {
    expect(doorStorageCapability({ NODE_ENV: 'test' })).toBe('fallback-signing');
  });
  it('fails the external staging journey instead of downgrading to fallback', () => {
    expect(() => doorStorageCapability({ NODE_ENV: 'test', PW_EXTERNAL_SERVER: '1' })).toThrow(
      'requires real Supabase Storage configuration'
    );
  });
  it.each(['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])(
    'refuses staging proof without %s',
    key => {
      expect(() => doorStorageCapability({ ...configured, [key]: '' })).toThrow();
    }
  );
  it('refuses local placeholder credentials on the staging journey', () => {
    expect(() =>
      doorStorageCapability({
        ...configured,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_anon_test_key_local_e2e',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role_test_key_local_e2e',
      })
    ).toThrow('requires real Supabase Storage configuration');
  });
  it('requires the URL used by the storage client even when a private URL exists', () => {
    expect(() =>
      doorStorageCapability({
        ...configured,
        SUPABASE_URL: configured.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: '',
      })
    ).toThrow('requires NEXT_PUBLIC_SUPABASE_URL');
  });
});
