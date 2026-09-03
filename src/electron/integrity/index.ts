import Database from 'better-sqlite3';
import { checkCashIntegrity } from './cashIntegrityChecker';
import { checkCustomerCreditIntegrity } from './customerCreditIntegrityChecker';
import { checkInventoryIntegrity } from './inventoryIntegrityChecker';
import { checkInvoiceIntegrity } from './invoiceIntegrityChecker';
import { checkOrderIntegrity } from './orderIntegrityChecker';
import { validateRestorePayload } from './restorePayloadValidator';
import { IntegrityIssue, IntegrityReport, createIssueCollector } from './types';

export {
  BACKUP_SCHEMA_VERSION,
  type IntegrityIssue,
  type IntegrityReport,
  type IntegritySeverity,
} from './types';
export { validateRestorePayload };

export function checkDatabaseIntegrity(db: Database.Database): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const issue = createIssueCollector(issues);

  const foreignKeys = db.pragma('foreign_key_check') as Array<{ table: string; rowid: number; parent: string; fkid: number }>;
  for (const row of foreignKeys) {
    issue({ code: 'ORPHAN_FOREIGN_KEY', table: row.table, recordId: String(row.rowid), expected: 'valid foreign key', actual: row.parent, reason: `Foreign key points to missing parent ${row.parent}` });
  }

  checkCashIntegrity(db, issue);
  checkOrderIntegrity(db, issue);
  checkInvoiceIntegrity(db, issue);
  checkInventoryIntegrity(db, issue);
  checkCustomerCreditIntegrity(db, issue);

  return { ok: issues.length === 0, checkedAt: new Date().toISOString(), issues };
}

export class DatabaseIntegrityService {
  constructor(private readonly db: Database.Database) {}

  check(): IntegrityReport {
    return checkDatabaseIntegrity(this.db);
  }

  static validateRestorePayload(payload: unknown): IntegrityReport {
    return validateRestorePayload(payload);
  }
}
