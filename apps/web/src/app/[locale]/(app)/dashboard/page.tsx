import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui';
import { AlertCircle, ArrowUpRight, FileText, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground">
          Welcome back! Here is what's happening with your claims today.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-premium hover:shadow-premium-hover transition-all duration-300 group border-none bg-white/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Active Claims</CardTitle>
              <CardDescription>Your ongoing disputes</CardDescription>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <FileText className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">0</p>
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <TrendingUp className="h-3 w-3 text-success" />
                No change
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-premium hover:shadow-premium-hover transition-all duration-300 group border-none bg-white/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Total Saved</CardTitle>
              <CardDescription>Money recovered</CardDescription>
            </div>
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center text-success group-hover:bg-success group-hover:text-white transition-colors duration-300">
              <ArrowUpRight className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">€0.00</p>
              <span className="text-xs text-muted-foreground font-medium">Lifetime total</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-premium hover:shadow-premium-hover transition-all duration-300 group border-none bg-white/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Action Items</CardTitle>
              <CardDescription>Pending tasks</CardDescription>
            </div>
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center text-warning group-hover:bg-warning group-hover:text-black transition-colors duration-300">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">0</p>
              <span className="text-xs text-destructive font-medium">Needs attention</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
