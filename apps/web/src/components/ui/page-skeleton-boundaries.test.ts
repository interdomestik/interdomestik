import { describe, expect, it, vi } from 'vitest';

import {
  ADMIN_NAMESPACES,
  AGENT_NAMESPACES,
  loadAllMessages,
  pickMessages,
  STAFF_NAMESPACES,
} from '@/i18n/messages';
import { LOCALES } from '@/i18n/locales';

vi.mock('@/i18n/routing', async () => {
  const { DEFAULT_LOCALE } = await import('@/i18n/locales');
  return { routing: { defaultLocale: DEFAULT_LOCALE } };
});

const boundarySources = import.meta.glob<string>(
  ['/src/app/**/loading.tsx', '/src/app/**/agent/workspace/claims/page.tsx'],
  { eager: true, import: 'default', query: '?raw' }
);
const skeletonSources = import.meta.glob<string>('./*page-skeleton.tsx', {
  eager: true,
  import: 'default',
  query: '?raw',
});
const localizedBoundaries = Object.entries(boundarySources).filter(([, source]) =>
  source.includes('LocalizedPageSkeleton')
);
const CLIENT_DIRECTIVE = /^['"]use client['"];\s/;

function getShellNamespaces(path: string) {
  if (path.includes('/(agent)/')) return AGENT_NAMESPACES;
  if (path.includes('/(staff)/')) return STAFF_NAMESPACES;
  expect(path).toContain('/admin/');
  return ADMIN_NAMESPACES;
}

describe('loading boundary locale isolation', () => {
  it('keeps translations behind an explicit client boundary', () => {
    const source = skeletonSources['./localized-page-skeleton.tsx'] ?? '';
    expect(source.trimStart()).toMatch(CLIENT_DIRECTIVE);
    expect(skeletonSources['./page-skeleton.tsx']).not.toContain('next-intl');
  });

  it.each(Object.entries(boundarySources))(
    '%s never resolves server request config',
    (_, source) => {
      if (!CLIENT_DIRECTIVE.test(source.trimStart())) {
        expect(source).not.toMatch(/from\s+['"]next-intl(?:\/[^'"]*)?['"]/);
      }
      if (source.includes('LocalizedPageSkeleton')) {
        expect(source).toContain("from '@/components/ui/localized-page-skeleton'");
      }
    }
  );

  it.each(LOCALES)(
    'provides every localized boundary title and loading label in %s',
    async locale => {
      const allMessages = await loadAllMessages(locale, { strict: true });
      expect(localizedBoundaries).toHaveLength(20);
      for (const [path, source] of localizedBoundaries) {
        const namespaces = getShellNamespaces(path);
        const titleKey = /titleKey="([^"]+)"/.exec(source)?.[1];
        expect(titleKey, path).toBeDefined();
        const messages = pickMessages(allMessages, namespaces);
        expect(messages, path).toHaveProperty(titleKey ?? '', expect.any(String));
        expect(messages, path).toHaveProperty('common.loading', expect.any(String));
      }
    }
  );
});
