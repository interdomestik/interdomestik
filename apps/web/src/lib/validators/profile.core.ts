import { z } from 'zod';

export const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  image: z.union([z.string().url('Invalid image URL'), z.literal('')]).optional(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
