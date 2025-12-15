import { z } from 'zod';

export const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  image: z.string().url('Invalid image URL').optional().or(z.literal('')),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
