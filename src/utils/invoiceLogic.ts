import { CustomerStyleDetails } from '../types';

export type SleeveMode = 'cuff' | 'plain' | 'unknown';

export function getSleeveMode(s?: CustomerStyleDetails | null): SleeveMode {
  if (!s) return 'unknown';
  const type = s.sleeveType || '';
  const padding = s.sleevePadding || '';

  if (/كبك/.test(type)) return 'cuff';
  if (/سادة|عادي|واسع|مفتوح/.test(type)) return 'plain';
  if (padding === 'كبك قلاب' || padding === 'كبك حشوة دبل' || padding === 'كبك حشوة سنجل') return 'cuff';
  if (padding === 'كبك سادة') return 'plain';
  return 'unknown';
}

export interface InvoiceFieldRules {
  hiddenMeasurementKeys: string[];
  hiddenStyleKeys: string[];
}

export function getHiddenFields(s?: CustomerStyleDetails | null): InvoiceFieldRules {
  const hiddenMeasurementKeys: string[] = [];
  const hiddenStyleKeys: string[] = [];

  const sleeveMode = getSleeveMode(s);
  if (sleeveMode === 'cuff') {
    hiddenMeasurementKeys.push('sleeveLength');
    hiddenStyleKeys.push('sleevePlainLength');
  } else if (sleeveMode === 'plain') {
    hiddenMeasurementKeys.push('cuffWidth');
    hiddenStyleKeys.push('sleeveCuffLength');
  }

  return { hiddenMeasurementKeys, hiddenStyleKeys };
}
