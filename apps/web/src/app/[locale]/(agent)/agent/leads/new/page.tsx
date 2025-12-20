import { Link } from '@/i18n/routing';
import { createLead } from '@/lib/actions/agent';
import { auth } from '@/lib/auth';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@interdomestik/ui';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function NewLeadPage() {
  // const t = await getTranslations('agent.leads_page');
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/auth/login');
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 pl-0 hover:bg-transparent">
            <Link href="/agent/leads">← Back to Leads</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Add New Lead</h1>
          <p className="text-muted-foreground">Manually add a potential member to your pipeline.</p>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm p-6">
        <form action={createLead} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Lead Type</Label>
              <Select name="type" defaultValue="individual">
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage">Initial Stage</Label>
              <Select name="stage" defaultValue="new">
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" name="fullName" placeholder="e.g. John Doe" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name (Optional)</Label>
            <Input id="companyName" name="companyName" placeholder="e.g. Acme Corp" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" placeholder="+383 44 ..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Select name="source" defaultValue="manual">
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="cold_call">Cold Call</SelectItem>
                <SelectItem value="event">Event / Networking</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Initial Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Any initial context..." />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" asChild>
              <Link href="/agent/leads">Cancel</Link>
            </Button>
            <Button type="submit">Create Lead</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
