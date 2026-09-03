import { Migration } from './types';
import { migration001 } from './001_accessory_purchase_price';
import { migration002 } from './002_order_references';
import { migration003 } from './003_order_events_indexes';
import { migration004 } from './004_order_events_created_at';
import { migration005 } from './005_performance_indexes';
import { migration006 } from './006_list_order_indexes';
import { migration007 } from './007_accessory_selling_price';
import { migration008 } from './008_unique_invoice_order';
import { migration009 } from './009_order_number_sequence';
import { migration010 } from './010_payment_settlement_and_liability';
import { migration011 } from './011_customer_credit_lifecycle';
import { migration012 } from './012_cash_adjustment_whitelist';
import { migration013 } from './013_inventory_wac_movement_cost';
import { migration014 } from './014_notifications_lifecycle';
import { migration015 } from './015_visible_customer_invoice_numbers';

export const MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015
].sort((a, b) => a.version - b.version);
