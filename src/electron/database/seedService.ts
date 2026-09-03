import Database from 'better-sqlite3';
import { Customer, FabricItem, AccessoryItem, ThobeType, ColorItem } from '../../types';
import { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS } from '../../services/shared/measurementDefaults';

export function seedInitialDataIfEmpty(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as { cnt: number }).cnt;
  const dataCleared = (db.prepare('SELECT value FROM system_settings WHERE key = ?').get('dataCleared') as { value?: string } | undefined)?.value === 'true';
  if (count > 0 || dataCleared) return;

  const seedCustomers: Customer[] = [
    {
      id: 'CUST-101',
      name: 'عبدالمجيد السلمان',
      phone: '0501234567',
      createdAt: '2026-07-10',
      measurements: { ...DEFAULT_MEASUREMENTS, frontLength: '148', shoulderWidth: '46', neckSize: '42' },
      styleDetails: { ...DEFAULT_STYLE_DETAILS, neckType: 'قلاب عالي', buttonsType: 'صدف بيج فاخر' },
      measurementHistory: []
    },
    {
      id: 'CUST-102',
      name: 'سعود بن عبدالعزيز المقرن',
      phone: '0559876543',
      createdAt: '2026-07-15',
      measurements: { ...DEFAULT_MEASUREMENTS, frontLength: '152', sleeveLength: '64', bottomSweep: '82' },
      styleDetails: { ...DEFAULT_STYLE_DETAILS, neckType: 'سادة (كويتي)', habroorType: 'حبرور بارز ٤ سم' },
      measurementHistory: []
    }
  ];

  const seedFabrics: FabricItem[] = [
    {
      id: 'FAB-01',
      name: 'ياباني كريب فاخر - تويوبو',
      color: 'أبيض نص لمعة',
      colorHex: '#f8fafc',
      purchasePrice: 45,
      sellingPrice: 120,
      quantityMeters: 45,
      minStockMeters: 20
    },
    {
      id: 'FAB-02',
      name: 'سلك كوري ممتاز - تيجين',
      color: 'كريمي فاتح',
      colorHex: '#fef3c7',
      purchasePrice: 35,
      sellingPrice: 95,
      quantityMeters: 12,
      minStockMeters: 25
    }
  ];

  const seedAccessories: AccessoryItem[] = [
    { id: 'ACC-01', name: 'أزرار صدف طبيعي (علبة 500)', category: 'أزرار', quantity: 15, minStock: 5, unit: 'علبة' },
    { id: 'ACC-02', name: 'حشوة يابانية للرقبة (رول)', category: 'حشوات', quantity: 2, minStock: 4, unit: 'رول' }
  ];

  const seedThobeTypes: ThobeType[] = [
    { id: 'THB-01', name: 'ثوب سعودي كلاسيك', defaultPrice: 220, description: 'الرقبة القلاب القياسية والكبك التقليدي' },
    { id: 'THB-02', name: 'ثوب كويتي فتحة صليب', defaultPrice: 240, description: 'بدون قلاب مع قَصّة كويتية ممتازة' }
  ];

  const seedColors: ColorItem[] = [
    { id: 'COL-01', name: 'أبيض ناصع', hex: '#ffffff' },
    { id: 'COL-02', name: 'أبيض نص لمعة', hex: '#f8fafc' },
    { id: 'COL-03', name: 'كريمي فاتح', hex: '#fef3c7' }
  ];

  const seedTx = db.transaction(() => {
    const cStmt = db.prepare('INSERT INTO customers (id, customer_number, name, phone, created_at, measurements_json, style_details_json) VALUES (?, ?, ?, ?, ?, ?, ?)');
    seedCustomers.forEach((c, index) => cStmt.run(c.id, index + 1, c.name, c.phone, c.createdAt, JSON.stringify(c.measurements), JSON.stringify(c.styleDetails)));

    db.prepare(`
      INSERT INTO visible_number_sequences (name, next_number)
      VALUES ('customers', COALESCE((SELECT MAX(customer_number) + 1 FROM customers), 1))
      ON CONFLICT(name) DO UPDATE SET next_number = MAX(visible_number_sequences.next_number, excluded.next_number)
    `).run();
    db.prepare(`
      INSERT INTO visible_number_sequences (name, next_number)
      VALUES ('invoices', COALESCE((SELECT MAX(visible_invoice_number) + 1 FROM invoices), 1))
      ON CONFLICT(name) DO UPDATE SET next_number = MAX(visible_number_sequences.next_number, excluded.next_number)
    `).run();

    const fStmt = db.prepare('INSERT INTO fabrics (id, name, color, color_hex, purchase_price, selling_price, quantity_meters, min_stock_meters, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    seedFabrics.forEach(f => fStmt.run(f.id, f.name, f.color, f.colorHex, f.purchasePrice, f.sellingPrice, f.quantityMeters, f.minStockMeters, new Date().toISOString()));

    const aStmt = db.prepare('INSERT INTO accessories (id, name, category, quantity, min_stock, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    seedAccessories.forEach(a => aStmt.run(a.id, a.name, a.category, a.quantity, a.minStock, a.unit, new Date().toISOString()));

    const tStmt = db.prepare('INSERT INTO dress_types (id, name, default_price, description) VALUES (?, ?, ?, ?)');
    seedThobeTypes.forEach(t => tStmt.run(t.id, t.name, t.defaultPrice, t.description));

    const colStmt = db.prepare('INSERT INTO colors (id, name, hex) VALUES (?, ?, ?)');
    seedColors.forEach(cl => colStmt.run(cl.id, cl.name, cl.hex));
  });

  seedTx();
}
