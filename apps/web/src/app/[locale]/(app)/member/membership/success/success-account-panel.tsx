import { PwaInstallButton } from '@/components/pwa/install-button';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { QrCode, ShieldCheck, Wallet } from 'lucide-react';

type AccountCopy = {
  registeredStatus: string;
  registeredBody: string;
  cardLabel: string;
  statusActive: string;
  cardIdPrefix: string;
  wallet: string;
  install: string;
};

export function SuccessAccountPanel(props: {
  membershipActive: boolean;
  memberName: string;
  memberId: string;
  memberNumber?: string | null;
  copy: AccountCopy;
}) {
  if (!props.membershipActive) {
    return (
      <Card
        data-testid="success-account-neutral"
        className="border-2 border-slate-200 bg-white shadow-lg forced-colors:border"
      >
        <CardHeader>
          <CardTitle className="text-xl leading-tight">{props.copy.registeredStatus}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-7 text-muted-foreground">{props.copy.registeredBody}</p>
        </CardContent>
      </Card>
    );
  }

  const visibleMemberNumber =
    props.memberNumber || `ID-${props.memberId.slice(0, 8).toUpperCase()}`;
  return (
    <Card data-testid="success-card" className="border-2 shadow-lg">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-lg">
          {props.copy.cardLabel}
          <Badge variant="secondary">{props.copy.statusActive}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-6 pb-6 pt-2">
          <div className="relative aspect-[1.586/1] overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 text-white shadow-2xl forced-colors:border">
            <div className="relative z-10 flex items-start justify-between">
              <div className="text-sm font-bold uppercase tracking-widest opacity-80">
                Asistenca
              </div>
              <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
            </div>
            <div className="relative z-10 mt-8">
              <div className="mb-1 text-xs opacity-50">{props.copy.cardIdPrefix}</div>
              <div className="break-all font-mono text-lg tracking-widest">
                {visibleMemberNumber}
              </div>
            </div>
            <div className="relative z-10 mt-auto flex items-end justify-between">
              <div className="text-xl font-bold">{props.memberName}</div>
              <div className="rounded-md bg-white p-1">
                <QrCode className="h-8 w-8 text-black" aria-hidden="true" />
              </div>
            </div>
          </div>
          <Button className="mt-6 h-12 w-full font-bold" variant="outline">
            <Wallet className="mr-2 h-5 w-5" aria-hidden="true" />
            {props.copy.wallet}
          </Button>
          <PwaInstallButton label={props.copy.install} className="mt-3 font-bold" />
        </div>
      </CardContent>
    </Card>
  );
}
