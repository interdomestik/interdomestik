import { Link } from '@/i18n/routing';
import { createHelpNowIncidentScenePack } from '@interdomestik/domain-assistance';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const HELP_NOW_CHECKLIST_CODES = [
  'scene_safety',
  'emergency_services',
  'document_scene',
  'exchange_information',
  'record_timeline',
  'preserve_documents',
] as const;

const HELP_NOW_STATIC_CREATED_AT = '2026-05-18T00:00:00.000Z';

export default async function IncidentGuidePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const dashboardT = await getTranslations({ locale, namespace: 'dashboard.home_grid' });
  const helpNowT = await getTranslations({
    locale,
    namespace: 'dashboard.member_cta_pages.incident_guide',
  });

  const pack = createHelpNowIncidentScenePack({
    packId: 'help-now-incident-scene-v1',
    sessionId: 'anonymous-help-now-incident-scene',
    guidanceChecklist: HELP_NOW_CHECKLIST_CODES,
    escalationRecommendation: 'member_zone',
    createdAt: HELP_NOW_STATIC_CREATED_AT,
  });

  return (
    <div className="container max-w-5xl space-y-6 py-8" data-testid="incident-guide-page-ready">
      <div className="space-y-3">
        <Badge variant="info" className="w-fit">
          {helpNowT('help_now_label')}
        </Badge>
        <h1 className="text-2xl font-bold">{dashboardT('cta_incident')}</h1>
        <p className="max-w-3xl text-muted-foreground">{helpNowT('description')}</p>
      </div>

      <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{helpNowT('disclaimer_title')}</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {pack.requiredDisclaimers.map(code => (
              <li key={code}>{helpNowT(`disclaimers.${code}`)}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card data-testid="help-now-incident-scene-pack">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {helpNowT('pack_title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{helpNowT('pack_description')}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">{helpNowT('checklist_title')}</h2>
              <ol className="mt-3 space-y-3">
                {pack.guidanceChecklist.map((item, index) => (
                  <li key={item} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span>{helpNowT(`checklist.${item}`)}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{helpNowT('member_boundary_title')}</p>
              <p className="mt-1">{helpNowT('member_boundary_body')}</p>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{helpNowT('pack_status_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{helpNowT('zone_label')}</span>
                <Badge variant="secondary">{helpNowT(`zones.${pack.zone}`)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{helpNowT('outcome_label')}</span>
                <Badge variant="outline">{helpNowT(`outcomes.${pack.outcome.kind}`)}</Badge>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{helpNowT('no_pii_value')}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{helpNowT('escalation_title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{helpNowT('escalation_body')}</p>
              <div className="flex flex-col gap-3">
                <Button asChild>
                  <Link href="/member/claims/new">
                    {helpNowT('primary')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/member/help">{helpNowT('secondary')}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
