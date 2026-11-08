import type { Metadata } from 'next';

import { toOpenGraphLocale } from '@/lib/open-graph-locale';

import { generateMetadata as generateEntryMetadata } from './_core.entry';

type LocaleMetadataProps = Parameters<typeof generateEntryMetadata>[0];

/** Locale layout metadata with the OpenGraph locale of the routed language (de_DE, sq_AL, en_US). */
export async function generateMetadata(props: LocaleMetadataProps): Promise<Metadata> {
  const [metadata, { locale }] = await Promise.all([generateEntryMetadata(props), props.params]);

  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, locale: toOpenGraphLocale(locale) },
  };
}
