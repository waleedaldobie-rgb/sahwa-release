export const BACKUP_SCHEMA_VERSION = 2;
export type IntegritySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface IntegrityIssue {
  code: string;
  table: string;
  recordId?: string;
  field?: string;
  expected: unknown;
  actual: unknown;
  reason: string;
  severity?: IntegritySeverity;
}

export interface IntegrityReport {
  ok: boolean;
  checkedAt: string;
  issues: IntegrityIssue[];
}

export const nearlyEqual = (left: number, right: number): boolean => Math.abs(left - right) <= 0.0001;

export type IssueCollector = (data: Omit<IntegrityIssue, 'expected' | 'actual'> & { expected?: unknown; actual?: unknown }) => void;

export function createIssueCollector(issues: IntegrityIssue[]): IssueCollector {
  return (data) => {
    issues.push({ severity: 'high', expected: data.expected ?? null, actual: data.actual ?? null, ...data });
  };
}
