
export interface DatabaseSettings {
  fabricConsumptionRatePerGarment: number; // default 3.5 meters
  autoBackupIntervalHours: number; // default 1 hour
  maxBackupFiles: number; // default 14
  lastBackupTimestamp?: string;
  schemaVersion: number; // current: 15
}

export const CURRENT_SCHEMA_VERSION = 15;

export const CREATE_TABLES_SQL = `
-- Enable PRAGMA FKs and WAL
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  customer_number INTEGER UNIQUE CHECK (customer_number IS NULL OR customer_number >= 1),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  measurements_json TEXT,
  style_details_json TEXT
);

-- Customer Measurement History
CREATE TABLE IF NOT EXISTS customer_measurement_history (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  note TEXT,
  measurements_json TEXT NOT NULL,
  style_details_json TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Fabrics
CREATE TABLE IF NOT EXISTS fabrics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  color_hex TEXT,
  purchase_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  quantity_meters REAL NOT NULL DEFAULT 0,
  min_stock_meters REAL NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL
);

-- Accessories
CREATE TABLE IF NOT EXISTS accessories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 5,
  unit TEXT NOT NULL DEFAULT 'حبة',
  purchase_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Thobe/Dress Types
CREATE TABLE IF NOT EXISTS dress_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_price REAL NOT NULL DEFAULT 0,
  description TEXT
);

-- Colors
CREATE TABLE IF NOT EXISTS colors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hex TEXT NOT NULL
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  thobe_type_id TEXT,
  thobe_type_name TEXT NOT NULL,
  fabric_id TEXT,
  fabric_name TEXT NOT NULL,
  fabric_color TEXT NOT NULL,
  fabric_consumption_meters REAL NOT NULL DEFAULT 3.5,
  fabric_buy_price_at_order REAL NOT NULL DEFAULT 0,
  garment_count INTEGER NOT NULL DEFAULT 1,
  order_date TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  cash_received REAL NOT NULL DEFAULT 0,
  overpayment_amount REAL NOT NULL DEFAULT 0,
  cancellation_writeoff_amount REAL NOT NULL DEFAULT 0,
  is_custom_measurement INTEGER NOT NULL DEFAULT 0,
  measurements_json TEXT NOT NULL,
  style_details_json TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (fabric_id) REFERENCES fabrics(id),
  FOREIGN KEY (thobe_type_id) REFERENCES dress_types(id)
);

-- Invoices & Payments
-- One invoice per order is enforced by migration 008 after duplicate validation.
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  visible_invoice_number INTEGER UNIQUE CHECK (visible_invoice_number IS NULL OR visible_invoice_number >= 1),
  order_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  order_date TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL NOT NULL DEFAULT 0,
  remaining_amount REAL NOT NULL DEFAULT 0,
  cash_received REAL NOT NULL DEFAULT 0,
  overpayment_amount REAL NOT NULL DEFAULT 0,
  cancellation_writeoff_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  payments_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Independent visible number sequences used by customers and invoices.
CREATE TABLE IF NOT EXISTS visible_number_sequences (
  name TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL CHECK (next_number >= 1)
);

-- Customer credit / refund-liability audit ledger. Entries are append-only.
CREATE TABLE IF NOT EXISTS customer_credits (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  order_id TEXT,
  invoice_id TEXT,
  payment_id TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('created', 'applied', 'refunded')),
  amount REAL NOT NULL CHECK (amount >= 0),
  reference_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  date TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  customer_phone TEXT,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  source TEXT NOT NULL DEFAULT 'legacy',
  source_id TEXT,
  read_at TEXT,
  archived_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  retry_history_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- Inventory movement ledger. Item references are polymorphic because fabrics and accessories live in separate tables.
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('fabric', 'accessory')),
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('purchase', 'sale', 'adjustment', 'return')),
  quantity REAL NOT NULL,
  quantity_before REAL NOT NULL,
  quantity_after REAL NOT NULL,
  unit TEXT NOT NULL,
  reason TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  reference_number TEXT,
  unit_cost REAL,
  total_cost REAL,
  source_movement_id TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL
);

-- Purchase headers and immutable line-level historical prices.
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier TEXT NOT NULL,
  invoice_number TEXT,
  purchase_date TEXT NOT NULL,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('fabric', 'accessory')),
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
);

-- Operating expenses. Cash movements reference these records by source_id.
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  expense_date TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  description TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);

-- Unified cash ledger. Opening balance is represented as a normal auditable entry.
CREATE TABLE IF NOT EXISTS cash_transactions (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  source_type TEXT NOT NULL CHECK (source_type IN ('opening_balance', 'adjustment', 'withdrawal', 'customer_payment', 'customer_refund', 'customer_credit_refund', 'purchase', 'expense', 'sale')),
  source_id TEXT,
  order_id TEXT,
  reference_number TEXT,
  amount REAL NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  transaction_date TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

-- Order audit/event timeline.
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Material snapshots used to calculate an order's historical cost.
CREATE TABLE IF NOT EXISTS order_material_usages (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('fabric', 'accessory')),
  item_id TEXT,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_cost_at_usage REAL NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  source_movement_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_history_customer ON customer_measurement_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_type, item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_purchase ON purchase_lines(purchase_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_date ON cash_transactions(transaction_date, created_at);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_source ON cash_transactions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_order_material_usages_order ON order_material_usages(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_order_date ON order_events(order_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_order_events_type ON order_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_customer_credits_customer_created ON customer_credits(customer_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_customer_credits_source ON customer_credits(payment_id, entry_type);

`;
