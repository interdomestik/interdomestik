'use client';

import { Link } from '@/i18n/routing';
import { createLead } from '@/lib/actions/agent';
import { type LeadStage } from '@interdomestik/database/constants';
import { Button } from '@interdomestik/ui/components/button';
import { Input } from '@interdomestik/ui/components/input';
import { Label } from '@interdomestik/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useActionState } from 'react';

const initialState = {
  error: '',
  fields: undefined as Record<string, string[]> | undefined,
};

const INITIAL_LEAD_STAGES: readonly LeadStage[] = ['new', 'contacted', 'qualified'];

function labelLeadStage(stage: LeadStage) {
  if (stage === 'new') return 'New';
  if (stage === 'contacted') return 'Contacted';
  if (stage === 'qualified') return 'Qualified';
  return stage;
}

export function CreateLeadForm() {
  const [state, action, pending] = useActionState(createLead, initialState);

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {state.error}
        </div>
      )}

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
              {INITIAL_LEAD_STAGES.map(stage => (
                <SelectItem key={stage} value={stage}>
                  {labelLeadStage(stage)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          name="fullName"
          placeholder="e.g. John Doe"
          required
          aria-invalid={!!state?.fields?.fullName}
        />
        {state?.fields?.fullName && (
          <p className="text-sm text-destructive">{state.fields.fullName[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="companyName">Company Name (Optional)</Label>
        <Input id="companyName" name="companyName" placeholder="e.g. Acme Corp" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="john@example.com" />
          {state?.fields?.email && (
            <p className="text-sm text-destructive">{state.fields.email[0]}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" placeholder="+383 44 ..." required />
          {state?.fields?.phone && (
            <p className="text-sm text-destructive">{state.fields.phone[0]}</p>
          )}
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
        <Button variant="outline" asChild disabled={pending}>
          <Link href="/agent/leads">Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Lead
        </Button>
      </div>
    </form>
  );
}
