import { Invoice } from '../types';

export type ValidationEntityType = 'customer' | 'order' | 'fabric' | 'accessory' | 'thobeType' | 'color' | 'payment';
export type ValidationRuleType = 'required_string' | 'positive_number' | 'non_negative_number' | 'custom';

export interface ValidationRule {
  field: string;
  label: string;
  type: ValidationRuleType;
  customCheck?: (value: unknown, record: Record<string, unknown>, extraContext?: unknown) => string | null;
}

export interface EntityValidationSchema {
  entityType: ValidationEntityType;
  rules: ValidationRule[];
}

export const VALIDATION_SCHEMAS: EntityValidationSchema[] = [
  {
    entityType: 'customer',
    rules: [
      { field: 'name', label: 'اسم العميل', type: 'required_string' },
      { field: 'phone', label: 'رقم هاتف العميل', type: 'required_string' }
    ]
  },
  {
    entityType: 'order',
    rules: [
      { field: 'customerName', label: 'اختيار العميل للطلب', type: 'required_string' },
      { field: 'totalAmount', label: 'إجمالي المبلغ', type: 'positive_number' },
      { field: 'paidAmount', label: 'المبلغ المدفوع', type: 'non_negative_number' },
      {
        field: 'paidAmount',
        label: 'المبلغ المدفوع',
        type: 'custom',
        customCheck: (value, order) => {
          if (typeof value === 'number' && typeof order.totalAmount === 'number' && value > order.totalAmount) {
            return 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي المبلغ';
          }
          return null;
        }
      },
      {
        field: 'garmentCount',
        label: 'عدد الثياب',
        type: 'custom',
        customCheck: (value) => {
          if (typeof value === 'number' && (Number.isNaN(value) || value <= 0)) {
            return 'عدد الثياب يجب أن يكون 1 على الأقل';
          }
          return null;
        }
      },
      {
        field: 'fabricConsumptionMeters',
        label: 'أمتار القماش المستخدمة',
        type: 'custom',
        customCheck: (value) => {
          if (typeof value === 'number' && (Number.isNaN(value) || value < 0)) {
            return 'أمتار القماش المستخدمة لا يمكن أن تكون بالسالب';
          }
          return null;
        }
      }
    ]
  },
  {
    entityType: 'payment',
    rules: [
      { field: 'amount', label: 'مبلغ الدفعة', type: 'positive_number' },
      {
        field: 'amount',
        label: 'مبلغ الدفعة',
        type: 'custom',
        customCheck: (value, _payment, extraContext) => {
          const targetInvoice = (extraContext as { targetInvoice?: Invoice } | undefined)?.targetInvoice;
          if (targetInvoice && typeof value === 'number' && value > targetInvoice.remainingAmount) {
            return `مبلغ الدفعة (${value}) يتجاوز المبلغ المتبقي للفاتورة (${targetInvoice.remainingAmount})`;
          }
          return null;
        }
      }
    ]
  },
  {
    entityType: 'fabric',
    rules: [
      { field: 'name', label: 'اسم صنف القماش', type: 'required_string' },
      { field: 'quantityMeters', label: 'الأمتار المتاحة', type: 'non_negative_number' },
      { field: 'sellingPrice', label: 'سعر البيع', type: 'non_negative_number' },
      {
        field: 'purchasePrice',
        label: 'سعر الشراء',
        type: 'custom',
        customCheck: (value) => {
          if (typeof value === 'number' && (Number.isNaN(value) || value < 0)) {
            return 'سعر الشراء لا يمكن أن يكون بالسالب';
          }
          return null;
        }
      }
    ]
  },
  {
    entityType: 'accessory',
    rules: [
      { field: 'name', label: 'اسم صنف الإكسسوار', type: 'required_string' },
      { field: 'quantity', label: 'الكمية المتاحة', type: 'non_negative_number' }
    ]
  },
  {
    entityType: 'thobeType',
    rules: [
      { field: 'name', label: 'اسم نوع الثوب', type: 'required_string' },
      { field: 'defaultPrice', label: 'السعر الأساسي لنوع الثوب', type: 'non_negative_number' }
    ]
  },
  {
    entityType: 'color',
    rules: [
      { field: 'name', label: 'اسم اللون', type: 'required_string' },
      { field: 'hex', label: 'كود اللون', type: 'required_string' }
    ]
  }
];

export function validateEntityErrors<T extends object>(
  entityType: ValidationEntityType,
  record: T,
  extraContext?: unknown
): string[] {
  const schema = VALIDATION_SCHEMAS.find((item) => item.entityType === entityType);
  const recordMap = record as Record<string, unknown>;
  if (!schema) return [];

  const errors: string[] = [];
  for (const rule of schema.rules) {
    const value = recordMap[rule.field];
    if (rule.type === 'required_string' && (!value || typeof value !== 'string' || value.trim() === '')) {
      errors.push(`يرجى إدخال ${rule.label} بشكل صحيح`);
    } else if (rule.type === 'positive_number' && (typeof value !== 'number' || Number.isNaN(value) || value <= 0)) {
      errors.push(`${rule.label} يجب أن يكون رقمًا موجبًا أكبر من الصفر`);
    } else if (rule.type === 'non_negative_number' && (typeof value !== 'number' || Number.isNaN(value) || value < 0)) {
      errors.push(`${rule.label} لا يمكن أن يكون بالسالب`);
    } else if (rule.type === 'custom' && rule.customCheck) {
      const error = rule.customCheck(value, recordMap, extraContext);
      if (error) errors.push(error);
    }
  }

  return Array.from(new Set(errors));
}

export function validateEntity<T extends object>(
  entityType: ValidationEntityType,
  record: T,
  extraContext?: unknown
): string | null {
  return validateEntityErrors(entityType, record, extraContext)[0] || null;
}
