import { describe, expect, it } from 'vitest';

import {
  extractSupabaseProjectRef,
  resolveSupabaseDeploymentEnvironment,
  validateSupabaseDeploymentSeparation,
} from './supabase-deployment.mjs';

describe('supabase-deployment', () => {
  it('detects preview and staging deployment environments from explicit deploy signals', () => {
    expect(resolveSupabaseDeploymentEnvironment({ VERCEL_ENV: 'preview' })).toBe('preview');
    expect(resolveSupabaseDeploymentEnvironment({ INTERDOMESTIK_DEPLOY_ENV: 'staging' })).toBe(
      'staging'
    );
    expect(resolveSupabaseDeploymentEnvironment({ VERCEL_ENV: 'production' })).toBe('production');
    expect(resolveSupabaseDeploymentEnvironment({ NODE_ENV: 'production' })).toBe('development');
  });

  it('extracts the project ref from hosted Supabase URLs', () => {
    expect(extractSupabaseProjectRef('https://prod-ref.supabase.co')).toBe('prod-ref');
    expect(extractSupabaseProjectRef('https://preview-ref.supabase.co/storage/v1')).toBe(
      'preview-ref'
    );
    expect(extractSupabaseProjectRef('http://127.0.0.1:54321')).toBe(null);
  });

  it('allows local development without deployment separation env', () => {
    expect(() =>
      validateSupabaseDeploymentSeparation({
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NODE_ENV: 'development',
      })
    ).not.toThrow();
  });

  it('rejects preview deployments that point at the production Supabase project', () => {
    expect(() =>
      validateSupabaseDeploymentSeparation({
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SUPABASE_URL: 'https://prod-ref.supabase.co',
        SUPABASE_PRODUCTION_PROJECT_REF: 'prod-ref',
      })
    ).toThrow(/preview deployment cannot target the production Supabase project/i);
  });

  it('rejects production deployments that do not point at the production Supabase project', () => {
    expect(() =>
      validateSupabaseDeploymentSeparation({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://preview-ref.supabase.co',
        SUPABASE_PRODUCTION_PROJECT_REF: 'prod-ref',
      })
    ).toThrow(/production deployment must target the production Supabase project/i);
  });

  it('accepts non-production deployments that stay off the production Supabase project', () => {
    expect(() =>
      validateSupabaseDeploymentSeparation({
        INTERDOMESTIK_DEPLOY_ENV: 'staging',
        NEXT_PUBLIC_SUPABASE_URL: 'https://staging-ref.supabase.co',
        SUPABASE_PRODUCTION_PROJECT_REF: 'prod-ref',
      })
    ).not.toThrow();
  });

  it('accepts SUPABASE_URL fallback and reports both env vars when missing', () => {
    expect(() =>
      validateSupabaseDeploymentSeparation({
        INTERDOMESTIK_DEPLOY_ENV: 'staging',
        SUPABASE_URL: 'https://staging-ref.supabase.co',
        SUPABASE_PRODUCTION_PROJECT_REF: 'prod-ref',
      })
    ).not.toThrow();

    expect(() =>
      validateSupabaseDeploymentSeparation({
        INTERDOMESTIK_DEPLOY_ENV: 'staging',
        SUPABASE_PRODUCTION_PROJECT_REF: 'prod-ref',
      })
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL/i);
  });
});
