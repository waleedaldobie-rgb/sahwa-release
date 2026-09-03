import { Migration } from './types';

export const migration004: Migration = {
  version: 4,
  name: 'order_events_created_at',
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at)');
  }
};
