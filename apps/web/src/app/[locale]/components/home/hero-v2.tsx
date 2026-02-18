type HeroV2Props = {
  locale: string;
  startClaimHref: string;
};

const HOW_IT_WORKS_STEPS = ['Member', 'Upload', 'Staff review'] as const;

export function HeroV2({ locale, startClaimHref }: HeroV2Props) {
  return (
    <section className="border-b bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 md:py-16 space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
            File your claim quickly, with transparent follow-up.
          </h1>
          <p className="max-w-2xl text-muted-foreground md:text-lg">
            Start in minutes, upload evidence once, and track every next step clearly.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              data-testid="hero-v2-start-claim"
              href={startClaimHref}
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start a claim
            </a>
            <a
              data-testid="hero-v2-sign-in"
              href={`/${locale}/login`}
              className="text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              Already have an account? Sign in
            </a>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <div key={step} className="rounded-md border bg-background px-3 py-2 text-sm">
              <span className="font-semibold">{index + 1}.</span> {step}
            </div>
          ))}
        </div>

        <div
          data-testid="hero-v2-trust-row"
          className="text-sm text-muted-foreground"
          aria-label="trust row"
        >
          Secure • Fast • Transparent • Used in pilot in KS/MK
        </div>
      </div>
    </section>
  );
}
