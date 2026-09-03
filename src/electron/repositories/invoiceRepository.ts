import Database from 'better-sqlite3';

export class InvoiceRepository {
  constructor(private readonly db: Database.Database) {}

  list(): any[] {
    return this.db.prepare('SELECT * FROM invoices ORDER BY order_date DESC').all();
  }

  findById(id: string): any | undefined {
    return this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  }

  findByOrderId(orderId: string): any | undefined {
    return this.db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(orderId);
  }

  nextVisibleInvoiceNumber(): number {
    const row = this.db.prepare(`
      INSERT INTO visible_number_sequences (name, next_number)
      VALUES ('invoices', 2)
      ON CONFLICT(name) DO UPDATE SET next_number = visible_number_sequences.next_number + 1
      RETURNING next_number - 1 AS allocated
    `).get() as { allocated: number };
    return row.allocated;
  }

  deleteByOrderId(orderId: string): void {
    this.db.prepare('DELETE FROM invoices WHERE order_id = ?').run(orderId);
  }

  updateAmounts(
    orderId: string,
    totalAmount: number,
    paidAmount: number,
    remainingAmount: number,
    paymentStatus: string,
    cashReceived = 0,
    overpaymentAmount = 0,
    cancellationWriteoffAmount = 0
  ): void {
    this.db.prepare(`
      UPDATE invoices SET
        total_amount = ?, paid_amount = ?, remaining_amount = ?,
        cash_received = ?, overpayment_amount = ?, cancellation_writeoff_amount = ?,
        payment_status = ?
      WHERE order_id = ?
    `).run(
      totalAmount,
      paidAmount,
      remainingAmount,
      cashReceived,
      overpaymentAmount,
      cancellationWriteoffAmount,
      paymentStatus,
      orderId
    );
  }

  updatePayment(
    id: string,
    paidAmount: number,
    remainingAmount: number,
    paymentStatus: string,
    paymentsJson: string,
    cashReceived = 0,
    overpaymentAmount = 0
  ): void {
    this.db.prepare(`
      UPDATE invoices SET
        paid_amount = ?, remaining_amount = ?, cash_received = ?,
        overpayment_amount = ?, payment_status = ?, payments_json = ?
      WHERE id = ?
    `).run(paidAmount, remainingAmount, cashReceived, overpaymentAmount, paymentStatus, paymentsJson, id);
  }
}
