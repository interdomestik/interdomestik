import Link from 'next/link';

type NotFoundCopy = Readonly<{ title: string; description: string; backHome: string }>;

/** Which boundary rendered: E2E gates tell the locale not-found apart from the error boundary. */
export type NotFoundScope = 'locale' | 'root';

export function BrandedNotFound({
  copy,
  homeHref,
  scope,
}: Readonly<{
  copy: NotFoundCopy;
  homeHref: string;
  scope: NotFoundScope;
}>): React.JSX.Element {
  return (
    <main
      data-testid="not-found-page"
      data-not-found-scope={`${scope}-not-found`}
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <p className="text-sm font-semibold tracking-widest text-primary">Interdomestik · 404</p>
      <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
      <p className="max-w-md text-muted-foreground">{copy.description}</p>
      <Link
        href={homeHref}
        className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        {copy.backHome}
      </Link>
    </main>
  );
}
