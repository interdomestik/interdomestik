import type { MetadataRoute } from 'next';

const BASE_URL = 'https://interdomestikasistenca.com';
const ROUTES = ['', '/pricing', '/services'] as const;
const SITEMAP_LOCALES = ['en', 'sq', 'sr', 'mk', 'de'] as const;

const localizedUrl = (locale: string, route: string): string => `${BASE_URL}/${locale}${route}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return SITEMAP_LOCALES.flatMap(locale =>
    ROUTES.map(route => ({
      url: localizedUrl(locale, route),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          SITEMAP_LOCALES.map(alternate => [alternate, localizedUrl(alternate, route)])
        ),
      },
    }))
  );
}
