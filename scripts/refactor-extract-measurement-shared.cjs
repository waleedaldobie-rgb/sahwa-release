const fs = require('fs');
const path = require('path');

const project = path.resolve(__dirname, '..');
const mockPath = path.join(project, 'src/services/electronMock.ts');
const sharedDir = path.join(project, 'src/services/shared');
const sharedPath = path.join(sharedDir, 'measurementDefaults.ts');
fs.mkdirSync(sharedDir, { recursive: true });

const mock = fs.readFileSync(mockPath, 'utf8');
const startMarker = '// Initial default measurements template';
const endMarker = '// Initial Seed Data';
const start = mock.indexOf(startMarker);
const end = mock.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) throw new Error('measurement block markers not found');

const shared = `import { CustomerMeasurements, CustomerStyleDetails } from '../../types';

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

export const EMPTY_MEASUREMENTS: CustomerMeasurements = Object.fromEntries(Object.keys(DEFAULT_MEASUREMENTS).map((key) => [key, ''])) as CustomerMeasurements;
export const EMPTY_STYLE_DETAILS: CustomerStyleDetails = Object.fromEntries(Object.keys(DEFAULT_STYLE_DETAILS).map((key) => [key, ''])) as CustomerStyleDetails;

export const normalizeMeasurements = (value?: Partial<CustomerMeasurements>): CustomerMeasurements => ({ ...DEFAULT_MEASUREMENTS, ...(value || {}) });
export const normalizeStyleDetails = (value?: Partial<CustomerStyleDetails>): CustomerStyleDetails => ({ ...DEFAULT_STYLE_DETAILS, ...(value || {}) });
`;
fs.writeFileSync(sharedPath, shared, 'utf8');

const importLine = "import { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS, normalizeMeasurements, normalizeStyleDetails } from './shared/measurementDefaults';\nexport { DEFAULT_MEASUREMENTS, DEFAULT_STYLE_DETAILS, EMPTY_MEASUREMENTS, EMPTY_STYLE_DETAILS, normalizeMeasurements, normalizeStyleDetails } from './shared/measurementDefaults';\n\n";
const updated = mock.slice(0, start) + importLine + mock.slice(end);
fs.writeFileSync(mockPath, updated, 'utf8');

for (const file of ['src/electron/db.ts', 'src/electron/ipcHandlers.ts']) {
  const filePath = path.join(project, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace("from '../services/electronMock'", "from '../services/shared/measurementDefaults'");
  fs.writeFileSync(filePath, content, 'utf8');
}
console.log(JSON.stringify({ sharedPath, mockPath }, null, 2));
