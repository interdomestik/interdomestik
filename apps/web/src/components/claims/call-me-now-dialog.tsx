'use client';

import { submitLead } from '@/actions/leads';
import { analytics } from '@/lib/analytics';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@interdomestik/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@interdomestik/ui/components/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@interdomestik/ui/components/form';
import { Input } from '@interdomestik/ui/components/input';
import { CheckCircle, Loader2, PhoneCall } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const formSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().min(6, 'Valid phone number is required'),
});

type FormValues = z.infer<typeof formSchema>;

interface CallMeNowDialogProps {
  category: string;
}

export function CallMeNowDialog({ category }: CallMeNowDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      phone: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await submitLead({
        name: values.name,
        phone: values.phone,
        category: category,
      });

      if (!result.success) throw new Error(result.error);

      analytics.track('call_me_now_submitted', { category });
      // Clean PII from analytics tracking if needed, but here we just send category

      setSubmitted(true);

      // Reset after success view
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        form.reset();
      }, 3000);
    } catch (error) {
      console.error('Submission error:', error);
      // Optionally show toast error
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      analytics.track('call_me_now_clicked', { category });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2 gap-2 text-primary border-primary hover:bg-primary/5"
          onClick={e => e.stopPropagation()} // Prevent card click
        >
          <PhoneCall className="h-4 w-4" />
          Request Immediate Callback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        {submitted ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-4 text-center animate-in fade-in zoom-in duration-300">
            <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Request Received!</h3>
              <p className="text-muted-foreground mt-1">
                Our team will call you at {form.getValues().phone} shortly.
              </p>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Talk to an Expert Now</DialogTitle>
                <DialogDescription>
                  Skip the forms. Leave your number and we'll call you within 15 minutes to discuss
                  your {category.replace('_', ' ')} case.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="049 123 456" type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Call Me Now'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
