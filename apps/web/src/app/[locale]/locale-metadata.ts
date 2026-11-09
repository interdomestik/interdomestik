import type { Metadata } from 'next';

import { toOpenGraphLocale } from '@/lib/open-graph-locale';

import { generateMetadata as generateEntryMetadata } from './_core.entry';

type LocaleMetadataProps = Parameters<typeof generateEntryMetadata>[0];

/**
 * Locale layout metadata with the OpenGraph locale of the routed language (de_DE, sq_AL, en_US)
 * and the same-origin PWA manifest. The entry metadata stays untouched: its unit is source-pinned.
 */
export async function generateMetadata(props: LocaleMetadataProps): Promise<Metadata> {
  const [metadata, { locale }] = await Promise.all([generateEntryMetadata(props), props.params]);

  return {
    ...metadata,
    manifest: '/manifest.json',
    openGraph: { ...metadata.openGraph, locale: toOpenGraphLocale(locale) },
  };
}
