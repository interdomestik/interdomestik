import { ShieldCheck } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

type AccidentJourneyFrameProps = Readonly<{
  children: ReactNode;
  contentRef: RefObject<HTMLDivElement | null>;
  eyebrow: string;
  intro: string;
  liveMode: 'off' | 'polite' | 'assertive';
  privacy: string;
}>;

export function AccidentJourneyFrame({
  children,
  contentRef,
  eyebrow,
  intro,
  liveMode,
  privacy,
}: AccidentJourneyFrameProps) {
  return (
    <section
      id="free-start-intake"
      data-testid="accident-safety-journey"
      className="border-b border-[#B8C7C7] bg-[#F7F5F0] text-[#001A33]"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:py-14 lg:grid-cols-[0.72fr_1.28fr] lg:gap-14">
        <div className="space-y-5">
          <p className="flex items-center gap-3 text-base font-bold uppercase tracking-[0.14em] text-[#006A70]">
            <span aria-hidden="true" className="h-px w-10 bg-[#008C8C]" />
            {eyebrow}
          </p>
          <p className="max-w-md text-base leading-7 text-[#334D5C]">{intro}</p>
          <div className="flex gap-3 border-t border-[#B8C7C7] pt-5 text-[#334D5C]">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#006A70]" />
            <p className="text-base leading-7">{privacy}</p>
          </div>
        </div>
        <div
          ref={contentRef}
          aria-live={liveMode}
          aria-atomic="true"
          aria-labelledby="accident-journey-heading"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
