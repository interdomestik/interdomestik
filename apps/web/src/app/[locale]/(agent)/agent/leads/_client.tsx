'use client';

import { createLeadAction } from '@/actions/leads/create';
import { startPaymentAction } from '@/actions/leads/payment';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { CheckCircle, Clock, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function AgentLeadsClient({ initialLeads }: { initialLeads: any[] }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const input = {
      firstName: formData.get('firstName') as string,
      lastName: formData.get('lastName') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      notes: (formData.get('notes') as string) || undefined,
    };

    const res = await createLeadAction(input);
    if (res.success) {
      toast.success('Lead created successfully');
      setIsCreateOpen(false);
      window.location.reload();
    } else {
      toast.error(res.error || 'Failed to create lead');
    }
  };

  const handleCashPayment = async (leadId: string) => {
    const res = await startPaymentAction({
      leadId,
      method: 'cash',
      amountCents: 12000,
      priceId: 'standard_plan_price',
    });

    if (res.success) {
      toast.success('Cash payment recorded. Pending verification.');
      window.location.reload();
    } else {
      toast.error(res.error || 'Failed to record payment');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> New Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" name="lastName" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
              <Button type="submit" className="w-full">
                Create Lead
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>First Name</TableHead>
              <TableHead>Last Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialLeads.map(lead => (
              <TableRow key={lead.id}>
                <TableCell>{lead.firstName}</TableCell>
                <TableCell>{lead.lastName}</TableCell>
                <TableCell>{lead.email}</TableCell>
                <TableCell>
                  <span className="capitalize">{lead.status.replace('_', ' ')}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {lead.status === 'new' && (
                      <Button size="sm" onClick={() => handleCashPayment(lead.id)}>
                        <Clock className="w-4 h-4 mr-2" />
                        Cash
                      </Button>
                    )}
                    {lead.status === 'payment_pending' && (
                      <span className="text-yellow-600 flex items-center text-sm">
                        <Clock className="w-4 h-4 mr-1" /> Pending
                      </span>
                    )}
                    {lead.status === 'converted' && (
                      <span className="text-green-600 flex items-center text-sm">
                        <CheckCircle className="w-4 h-4 mr-1" /> Member
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
