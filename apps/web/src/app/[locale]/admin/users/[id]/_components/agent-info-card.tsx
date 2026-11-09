import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { User } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

type Agent = {
  name: string | null;
  email: string;
  image: string | null;
};

export async function AgentInfoCard({
  agent,
  locale,
}: Readonly<{
  agent: Agent | null | undefined;
  locale: string;
}>): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'admin.member_profile' });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.agent')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {agent ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={agent.image || ''} />
              <AvatarFallback>
                {(agent.name || agent.email || 'A')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="font-medium text-foreground">{agent.name || t('labels.unknown')}</p>
              <p className="text-muted-foreground">{agent.email}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            {t('labels.no_agent')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
