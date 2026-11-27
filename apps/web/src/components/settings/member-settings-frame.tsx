import type { ReactNode } from 'react';

export type MemberSettingsSection = Readonly<{
  /** The section anchor; other screens link to `#profile` and `#notifications`. Unique on the page. */
  id: string;
  title: string;
  content: ReactNode;
}>;

type MemberSettingsFrameProps = Readonly<{
  title: string;
  description: string;
  account: readonly MemberSettingsSection[];
  preferences: readonly MemberSettingsSection[];
  terms: ReactNode;
}>;

function SettingsSection({ id, title, content }: MemberSettingsSection) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-24 space-y-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {content}
    </section>
  );
}

/** The member settings screen on concept A (WP-18): profile and security, then preferences. */
export function MemberSettingsFrame({
  title,
  description,
  account,
  preferences,
  terms,
}: MemberSettingsFrameProps) {
  return (
    <section
      aria-labelledby="member-settings-title"
      className="min-w-0 space-y-6 p-4 [overflow-wrap:anywhere] sm:space-y-8 sm:p-6 md:p-0"
      data-testid="member-settings-page-ready"
    >
      <header className="max-w-3xl space-y-3 py-1 sm:py-2">
        <h1
          id="member-settings-title"
          className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
        >
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-foreground/70 sm:text-base">{description}</p>
      </header>
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-2">
        {[account, preferences].map((column, index) => (
          <div key={index === 0 ? 'account' : 'preferences'} className="grid min-w-0 gap-8">
            {column.map(section => (
              <SettingsSection key={section.id} {...section} />
            ))}
          </div>
        ))}
      </div>
      {terms}
    </section>
  );
}

type SettingsUnavailableProps = Readonly<{ href: string; message: string; retryLabel: string }>;

/**
 * A section whose read failed. It shows no form, so nothing can overwrite the stored value with a
 * blank one, and its retry is a native link that runs the server read again.
 */
export function MemberSettingsUnavailable({ href, message, retryLabel }: SettingsUnavailableProps) {
  return (
    <div
      className="min-w-0 space-y-4 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 sm:p-6 forced-colors:border-[CanvasText]"
      data-region-state="error"
    >
      <p className="max-w-prose text-sm leading-6 text-foreground/70" role="alert">
        {message}
      </p>
      <a
        className="inline-flex min-h-11 min-w-11 max-w-full items-center rounded-xl border border-foreground/60 px-4 py-2 text-sm font-semibold hover:bg-[hsl(var(--surface-strong))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline"
        href={href}
      >
        {retryLabel}
      </a>
    </div>
  );
}
