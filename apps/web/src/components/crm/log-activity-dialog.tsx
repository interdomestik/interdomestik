'use client';

import { logActivity, logLeadActivity } from '@/actions/activities';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
});

interface LogActivityDialogProps {
  entityId: string;
  entityType?: 'member' | 'lead';
}

export function LogActivityDialog({ entityId, entityType = 'member' }: LogActivityDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('agent.activity_dialog');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'call',
      subject: '',
      description: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    let result;

    if (entityType === 'member') {
      result = await logActivity({
        memberId: entityId,
        ...values,
      });
    } else {
      result = await logLeadActivity({
        leadId: entityId,
        ...values,
      });
    }

    if (result && 'error' in result) {
      toast.error(result.error);
    } else {
      toast.success(t('success'));
      setOpen(false);
      form.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {t('trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { entityType: t(`entity_type.${entityType}`) })}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.type.label')}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('fields.type.placeholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="call">{t('types.call')}</SelectItem>
                        <SelectItem value="email">{t('types.email')}</SelectItem>
                        <SelectItem value="meeting">{t('types.meeting')}</SelectItem>
                        <SelectItem value="note">{t('types.note')}</SelectItem>
                        <SelectItem value="other">{t('types.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.subject.label')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('fields.subject.placeholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.description.label')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('fields.description.placeholder')}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
