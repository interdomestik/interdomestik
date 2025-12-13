import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui';

export default function DashboardPage() {
  // In a real app we'd fetch data here

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Active Claims</CardTitle>
            <CardDescription>Your ongoing disputes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Saved</CardTitle>
            <CardDescription>Money recovered</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">€0.00</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Action Items</CardTitle>
            <CardDescription>Pending tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
