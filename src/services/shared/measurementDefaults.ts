import { CustomerMeasurements, CustomerStyleDetails } from '../../types';

export const DEFAULT_MEASUREMENTS: CustomerMeasurements = {
  frontLength: '145', backLength: '146', shoulderWidth: '44', shoulderSlope: '3.5', sleeveLength: '62', cuffWidth: '13',
  handOpeningTop: '26', handOpeningMid: '22', handOpeningLowerMid: '19', handOpeningBottom: '16', neckSize: '40', neckHeight: '4.5',
  chestSize: '108', waistSize: '102', hipSize: '112', clearances: '8', stepSize: '75', overlapSize: '6', pieceCount: '1', bottomSweep: '78', currentWeight: '76'
};

export const DEFAULT_STYLE_DETAILS: CustomerStyleDetails = {
  neckSizeHeader: '40', neckHeightHeader: '4.5', neckType: 'قلاب', neckShape: 'سادة', neckPadding: 'حشوة عادي', neckLining: 'حشو ألماني مقوى', neckNotes: '',
  buttonsType: 'طقاق حديد مخفي', habroorType: 'حبرور سادة', habroorPadding: 'واحد حشوة', habroorLining: 'حشوة خفيفة', habroorStyle: 'عرض ٣.٥ سم', habroorLength: '3.5', habroorBottom: 'مربع عادي',
  sleeveCuffLength: '62', sleevePlainLength: '61', sleeveType: 'كم عادي', sleevePadding: 'كبك حشوة سنجل', sleeveShape: 'مستقيم', sleeveLining: 'بدون حشو', pleatsStyle: 'كسرة واحدة خلفية', sleeveNotes: '',
  chestPocketDrop: '22', chestPocketWidth: '13', chestPocketPadding: 'حشوة سنجل', chestPocketStyle: 'مربع بكسرة علوية', chestLining: 'قماش رقيق مطابق', pocketNotes: '',
  sidePockets: 'جيب جانبي مزدوج', mobilePocketRight: 'جوال يمين', mobilePocketLeft: 'بدون', penPocketStyle: 'جيب قلم جانبي مخفي', rightSide: 'جيب مخفي بجوال', leftSide: 'جيب قياسي', bottomHemShape: 'جبزور مربع',
  cuff1: 'كبك زرارين', cuff2: 'عرض ٦ سم', cuff3: 'بطانة متوسطة', cuff4: 'فتحة زاوية', cuff5: 'خياطة بارزة', stitchingType: 'خياطة دقيقة مزدوجة', richieMark: 'علامة صهوة الأصيلة', generalNotes: 'يفضل غسيل بالماء البارد دون استخدام مبيضات', additionalNotes: 'التأكد من شد الخياطة عند الكتف', tailorNotes: '', modelPhoto: '', modelTextDescription: ''
};

export const EMPTY_MEASUREMENTS: CustomerMeasurements = {
  frontLength: '', backLength: '', shoulderWidth: '', shoulderSlope: '', sleeveLength: '', cuffWidth: '',
  handOpeningTop: '', handOpeningMid: '', handOpeningLowerMid: '', handOpeningBottom: '', neckSize: '', neckHeight: '',
  chestSize: '', waistSize: '', hipSize: '', clearances: '', stepSize: '', overlapSize: '', pieceCount: '', bottomSweep: '', currentWeight: ''
};

export const EMPTY_STYLE_DETAILS: CustomerStyleDetails = {
  neckSizeHeader: '', neckHeightHeader: '', neckType: '', neckShape: '', neckPadding: '', neckLining: '', neckNotes: '',
  buttonsType: '', habroorType: '', habroorPadding: '', habroorLining: '', habroorStyle: '', habroorLength: '', habroorBottom: '',
  sleeveCuffLength: '', sleevePlainLength: '', sleeveType: '', sleevePadding: '', sleeveShape: '', sleeveLining: '', pleatsStyle: '', sleeveNotes: '',
  chestPocketDrop: '', chestPocketWidth: '', chestPocketPadding: '', chestPocketStyle: '', chestLining: '', pocketNotes: '',
  sidePockets: '', mobilePocketRight: '', mobilePocketLeft: '', penPocketStyle: '', rightSide: '', leftSide: '', bottomHemShape: '',
  cuff1: '', cuff2: '', cuff3: '', cuff4: '', cuff5: '', stitchingType: '', richieMark: '', generalNotes: '', additionalNotes: '', tailorNotes: '', modelPhoto: '', modelTextDescription: ''
};

export const normalizeMeasurements = (value?: Partial<CustomerMeasurements>): CustomerMeasurements => ({
  ...EMPTY_MEASUREMENTS,
  ...(value || {})
});

export const normalizeStyleDetails = (value?: Partial<CustomerStyleDetails>): CustomerStyleDetails => ({
  ...EMPTY_STYLE_DETAILS,
  ...(value || {})
});
