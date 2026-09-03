import { Migration } from './types';

export const migration003: Migration = {
  version: 3,
  name: 'order_events_indexes',
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_order_events_order_date ON order_events(order_id, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_order_events_type ON order_events(event_type)');
  }
};
