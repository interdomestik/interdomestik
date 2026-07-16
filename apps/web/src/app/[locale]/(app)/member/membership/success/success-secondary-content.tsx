import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';

type SecondaryCopy = {
  hotlineLabel: string;
  hotlineHint: string;
  disclaimerTitle: string;
  disclaimerBody: string;
  benefitsTitle: string;
  benefits: string[];
};

export function SuccessSecondaryContent(props: {
  membershipActive: boolean;
  accountPanel: ReactNode;
  support: { telHref: string; phoneDisplay: string };
  copy: SecondaryCopy;
}) {
  return (
    <>
      <div className="grid gap-8 md:grid-cols-2">
        {props.accountPanel}
        <Card data-testid="success-hotline" className="overflow-hidden border-primary shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
              {props.copy.hotlineLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 forced-colors:border">
                <p className="mb-1 text-sm font-bold uppercase tracking-wider text-primary">
                  {props.copy.hotlineLabel}
                </p>
                <a
                  href={props.support.telHref}
                  className="break-words text-2xl font-black tracking-tighter text-foreground"
                >
                  {props.support.phoneDisplay}
                </a>
                <p className="mt-2 text-sm text-muted-foreground">{props.copy.hotlineHint}</p>
              </div>
              <CommercialDisclaimerNotice
                sectionTestId="success-hotline-disclaimer"
                items={[
                  {
                    title: props.copy.disclaimerTitle,
                    body: props.copy.disclaimerBody,
                  },
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {props.membershipActive ? (
        <div
          data-testid="success-benefits"
          className="mt-16 rounded-3xl border bg-muted/30 p-6 sm:p-10"
        >
          <h2 className="mb-8 text-center text-2xl font-bold">{props.copy.benefitsTitle}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {props.copy.benefits.map((benefit, index) => (
              <div
                key={benefit}
                className="flex flex-col items-center space-y-3 rounded-2xl border bg-white p-4 text-center shadow-sm forced-colors:border"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/5">
                  <span className="font-bold text-primary">{index + 1}</span>
                </div>
                <p className="text-sm font-medium leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
