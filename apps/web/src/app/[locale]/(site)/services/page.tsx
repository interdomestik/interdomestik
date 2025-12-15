import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Banknote, CheckCircle2, FileText, Scale, Shield, Zap } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';

import { getTranslations } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'services' });

  return (
    <main className="container mx-auto px-4 py-16">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="text-center">
          {/* Note: Header is hardcoded in original file too or maybe generic common? Keeping hardcoded for now as I didn't add keys for header in this step, only panels */}
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">Our Services</h1>
          <p className="text-xl text-[hsl(var(--muted-500))] max-w-2xl mx-auto">
            Professional mediation and assistance for all types of damage claims.
          </p>
        </div>

        {/* Speed & Safety Panel */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Zap className="h-5 w-5" /> {t('speed.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-blue-700">
                {t.rich('speed.desc', { bold: chunks => <strong>{chunks}</strong> })}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <Shield className="h-5 w-5" /> {t('safety.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-green-700">{t('safety.desc')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Legal Basis */}
        <Card className="border-l-4 border-l-[hsl(var(--primary))]">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-full bg-[hsl(var(--primary))]/10">
              <Scale className="h-8 w-8 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <CardTitle className="text-2xl">Legal Basis Determination</CardTitle>
              <p className="text-sm font-semibold text-[hsl(var(--success))] mt-1">
                ✨ FREE Consultation
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[hsl(var(--muted-foreground))]">
              Our team of legal experts analyzes your case free of charge to determine if the legal
              basis for compensation exists. We review police reports, medical documents, and
              insurance policies to build a solid foundation for your claim.
            </p>
          </CardContent>
        </Card>

        {/* Documentation */}
        <Card className="border-l-4 border-l-[hsl(var(--primary))]">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-full bg-[hsl(var(--primary))]/10">
              <FileText className="h-8 w-8 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <CardTitle className="text-2xl">Procedure Management</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[hsl(var(--muted-foreground))]">
              Navigating insurance bureaucracy is complex. We handle all procedural requirements:
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                File Compilation
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                Submission to Insurers
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                Deadline Tracking
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                Correspondence Management
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Payout */}
        <Card className="border-l-4 border-l-[hsl(var(--primary))]">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-3 rounded-full bg-[hsl(var(--primary))]/10">
              <Banknote className="h-8 w-8 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <CardTitle className="text-2xl">Compensation Negotiation</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[hsl(var(--muted-foreground))]">
              We negotiate directly with insurance companies to ensure you receive the maximum
              compensation you are entitled to under the law, not just what the insurer wants to
              offer.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
