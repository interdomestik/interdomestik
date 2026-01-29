'use client';

import { registerMemberPOS } from '@/features/agent/pos/actions';
import { Button } from '@interdomestik/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@interdomestik/ui/components/form';
import { Input } from '@interdomestik/ui/components/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  plateNumber: z.string().min(3, 'Plate number is required').toUpperCase(),
  phoneNumber: z.string().min(9, 'Valid phone number required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
});

export function QuickRegisterForm({ agentId }: { agentId: string }) {
  const [successData, setSuccessData] = useState<{ memberId: string; phone: string } | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      plateNumber: '',
      phoneNumber: '',
      email: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const result = await registerMemberPOS(values);
      if (result.success && result.data) {
        setSuccessData(result.data);
        toast.success('Member Registered Successfully');
        form.reset();
      } else {
        toast.error(result.error || 'Registration failed');
      }
    } catch (error) {
      toast.error('Registration failed');
    }
  }

  if (successData) {
    return (
      <div className="flex flex-col items-center justify-center space-y-6 py-8 text-center animate-in fade-in zoom-in-95">
        <div className="rounded-full bg-green-100 p-3 text-green-600 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Registration Complete!</h2>
          <p className="text-muted-foreground">
            Digital ID sent to{' '}
            <span className="font-mono font-medium text-foreground">{successData.phone}</span>
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>
          <Button onClick={() => setSuccessData(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Register Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="plateNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plate Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="01-123-AB"
                    {...field}
                    onChange={e => field.onChange(e.target.value.toUpperCase())}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number (WhatsApp)</FormLabel>
                <FormControl>
                  <Input placeholder="+383 49 ..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="john@example.com" {...field} />
                </FormControl>
                <FormDescription>Leave blank if customer has no email.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="pt-4 border-t">
          <div className="flex justify-between items-center mb-4 text-sm">
            <span className="text-muted-foreground">Membership Plan (Standard)</span>
            <span className="font-bold">€100.00</span>
          </div>
          <div className="flex justify-between items-center mb-6 text-sm">
            <span className="text-green-600 font-medium">Your Commission (50%)</span>
            <span className="font-bold text-green-600">-€50.00</span>
          </div>
          <div className="flex justify-between items-center mb-6 text-lg">
            <span className="font-bold">Total to Pay</span>
            <span className="font-bold">€50.00</span>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full text-lg h-12"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm & Charge €50.00
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-3">
            Payment will be deducted from your Agent Wallet or charged to your file card.
          </p>
        </div>
      </form>
    </Form>
  );
}
