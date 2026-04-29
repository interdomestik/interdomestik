// Type shim for zod v4 compatibility with @hookform/resolvers.
declare module '@hookform/resolvers/zod' {
  import type { FieldValues, Resolver } from 'react-hook-form';
  import type { ZodTypeAny } from 'zod';

  export function zodResolver<TFieldValues extends FieldValues = FieldValues>(
    schema: ZodTypeAny,
    schemaOptions?: unknown,
    resolverOptions?: unknown
  ): Resolver<TFieldValues>;
}
