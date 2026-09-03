import { z } from 'zod';

export function parseIpcInput<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  label: string,
): z.output<T> {
  const result = schema.safeParse(input);

  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'القيمة';
      return `${path}: ${issue.message}`;
    })
    .join('، ');

  throw new Error(`${label} غير صالح: ${details}`);
}
