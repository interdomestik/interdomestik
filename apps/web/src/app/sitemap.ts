import { MetadataRoute } from 'next';

const BASE_URL = 'https://interdomestikasistenca.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/pricing', '/services', '/contact', '/faq'].map(route => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: route === '' ? 1 : 0.8,
  }));

  const locales = ['en', 'sq', 'sr', 'mk'];
  const localedRoutes = locales.flatMap(locale =>
    routes.map(route => ({
      ...route,
      url: `${BASE_URL}/${locale}${route.url.replace(BASE_URL, '')}`,
    }))
  );

  return localedRoutes;
}
