'use client';

import { createLeadAction } from '@/actions/leads/create';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@interdomestik/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface CreateLeadDialogProps {
  onSuccess: () => void;
}

export function CreateLeadDialog({ onSuccess }: CreateLeadDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
      setOpen(false);
      onSuccess();
    } else {
      toast.error(res.error || 'Failed to create lead');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-lead-button">
          <Plus className="w-4 h-4 mr-2" /> New Lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4" data-testid="create-lead-form">
          <div className="grid gap-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input id="firstName" name="firstName" required data-testid="lead-form-firstname" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input id="lastName" name="lastName" required data-testid="lead-form-lastname" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required data-testid="lead-form-email" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" required data-testid="lead-form-phone" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" data-testid="lead-form-notes" />
          </div>
          <Button type="submit" className="w-full" data-testid="lead-form-submit">
            Create Lead
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
