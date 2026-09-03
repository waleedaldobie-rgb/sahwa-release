export function normalizePositiveAmount(amount: unknown, label: string): number {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error(`${label} يجب أن يكون أكبر من صفر`);
  }
  return numericAmount;
}
