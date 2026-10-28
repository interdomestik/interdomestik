import { describe, expect, it } from 'vitest';
import { assertSyntheticMessageDatabaseUrl } from './tenant-context.integration-fixture';
describe('message fixture database safety', () => {
  it('accepts the synthetic CI and task ports without a machine-specific port constraint', () => {
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@127.0.0.1:5432/interdomestik_test')
    ).not.toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@localhost:55435/interdomestik_test')
    ).not.toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres')
    ).not.toThrow();
  });
  it('rejects remote and non-synthetic databases before creating clients or fixtures', () => {
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@db.example.test:5432/interdomestik_test'
      )
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@db.example.test:5432/interdomestik_s8'
      )
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@127.0.0.1:5432/production')
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@127.0.0.1:5432/postgres')
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@db.example.test:54322/postgres')
    ).toThrow();
  });
  it('rejects connection-string options that could redirect the approved target', () => {
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@127.0.0.1:5432/interdomestik_test?host=db.example.test'
      )
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@127.0.0.1:5432/interdomestik_test?options=unsafe'
      )
    ).toThrow();
  });
});
