/**
 * ข้อมูลตั้งต้นของระบบภาษีเงินได้บุคคลธรรมดา
 * — อัตราภาษีขั้นบันได, ประเภทเงินได้ตามมาตรา 40, และรายการค่าลดหย่อน
 *
 * ตัวเลขอ้างอิงเกณฑ์ภาษีเงินได้บุคคลธรรมดาของกรมสรรพากร แต่โปรเจกต์นี้
 * เป็นงานเพื่อการศึกษา — ก่อนยื่นจริงต้องตรวจสอบประกาศปีภาษีนั้นอีกครั้ง
 */

/* ---------- อัตราภาษีขั้นบันได ---------- */

export interface TaxBracket {
  /** เพดานเงินได้สุทธิของขั้นนี้ (บาท) */
  cap: number
  rate: number
  label: string
}

export const TAX_BRACKETS: TaxBracket[] = [
  { cap: 150_000, rate: 0, label: '0 – 150,000' },
  { cap: 300_000, rate: 0.05, label: '150,001 – 300,000' },
  { cap: 500_000, rate: 0.1, label: '300,001 – 500,000' },
  { cap: 750_000, rate: 0.15, label: '500,001 – 750,000' },
  { cap: 1_000_000, rate: 0.2, label: '750,001 – 1,000,000' },
  { cap: 2_000_000, rate: 0.25, label: '1,000,001 – 2,000,000' },
  { cap: 5_000_000, rate: 0.3, label: '2,000,001 – 5,000,000' },
  { cap: Number.POSITIVE_INFINITY, rate: 0.35, label: '5,000,001 บาทขึ้นไป' },
]

/* ---------- ประเภทเงินได้ (มาตรา 40) ---------- */

export interface IncomeCategory {
  key: string
  /** มาตราตามประมวลรัษฎากร เช่น 40(1) */
  code: string
  label: string
  hint: string
  /** อัตราหักค่าใช้จ่ายแบบเหมา */
  expenseRate: number
  /** เพดานค่าใช้จ่าย (บาท) — null คือไม่มีเพดาน */
  expenseCap: number | null
  /**
   * ประเภทที่ใช้เพดานค่าใช้จ่ายร่วมกัน — 40(1) กับ 40(2) หักรวมกันได้ไม่เกิน 100,000
   * ประเภทที่ไม่ระบุจะคิดเพดานของตัวเอง
   */
  expensePool?: string
}

export const INCOME_CATEGORIES: IncomeCategory[] = [
  {
    key: 'salary',
    code: '40(1)',
    label: 'เงินเดือนและค่าจ้าง',
    hint: 'รายได้ประจำจากนายจ้าง รวมโบนัสและค่าล่วงเวลา',
    expenseRate: 0.5,
    expenseCap: 100_000,
    expensePool: 'employment',
  },
  {
    key: 'freelance',
    code: '40(2)',
    label: 'รับจ้างทั่วไป / ค่านายหน้า',
    hint: 'งานฟรีแลนซ์ ค่าคอมมิชชัน ค่าตอบแทนที่ไม่ใช่เงินเดือนประจำ',
    expenseRate: 0.5,
    expenseCap: 100_000,
    expensePool: 'employment',
  },
  {
    key: 'royalty',
    code: '40(3)',
    label: 'ค่าลิขสิทธิ์ / ค่าสิทธิ',
    hint: 'ค่าลิขสิทธิ์ สิทธิบัตร กู๊ดวิลล์ และค่าตอบแทนทรัพย์สินทางปัญญา',
    expenseRate: 0.5,
    expenseCap: 100_000,
  },
  {
    key: 'investment',
    code: '40(4)',
    label: 'ดอกเบี้ย / เงินปันผล',
    hint: 'ดอกเบี้ยเงินฝาก หุ้นกู้ และเงินปันผล — กฎหมายไม่ให้หักค่าใช้จ่าย',
    expenseRate: 0,
    expenseCap: null,
  },
  {
    key: 'rent',
    code: '40(5)',
    label: 'ค่าเช่าทรัพย์สิน',
    hint: 'ค่าเช่าบ้าน อาคาร ที่ดิน หรือยานพาหนะ',
    expenseRate: 0.3,
    expenseCap: null,
  },
  {
    key: 'profession',
    code: '40(6)',
    label: 'วิชาชีพอิสระ',
    hint: 'กฎหมาย บัญชี วิศวกรรม สถาปัตยกรรม ประณีตศิลป์',
    expenseRate: 0.3,
    expenseCap: null,
  },
  {
    key: 'contractor',
    code: '40(7)',
    label: 'รับเหมาก่อสร้าง',
    hint: 'งานรับเหมาที่ผู้รับเหมาจัดหาสัมภาระเอง',
    expenseRate: 0.6,
    expenseCap: null,
  },
  {
    key: 'business',
    code: '40(8)',
    label: 'ธุรกิจ / พาณิชย์ / อื่น ๆ',
    hint: 'ค้าขาย เกษตรกรรม อุตสาหกรรม ขนส่ง และเงินได้อื่นที่ไม่เข้าข้อใด',
    expenseRate: 0.6,
    expenseCap: null,
  },
]

/* ---------- ค่าลดหย่อน ---------- */

export type DeductionGroup = 'personal' | 'insurance' | 'investment' | 'housing' | 'donation'

export interface DeductionItem {
  key: string
  label: string
  hint: string
  group: DeductionGroup
  /** เพดานเป็นจำนวนเงิน — null คือไม่จำกัดด้วยตัวเลขคงที่ */
  cap: number | null
  /** เพดานเพิ่มเติมคิดเป็นสัดส่วนของเงินได้พึงประเมิน เช่น กองทุนสำรองเลี้ยงชีพ 15% */
  capRateOfIncome?: number
  /** ค่าลดหย่อนคงที่ แก้ไขไม่ได้ (เช่น ค่าลดหย่อนส่วนตัว 60,000) */
  fixed?: boolean
  /** จำนวนเงินตั้งต้น */
  preset?: number
  /** เงินบริจาคเพื่อการศึกษา/กีฬา หักได้ 2 เท่าของที่จ่ายจริง */
  multiplier?: number
}

export const DEDUCTION_GROUPS: Record<DeductionGroup, { label: string; hint: string }> = {
  personal: { label: 'ลดหย่อนส่วนตัวและครอบครัว', hint: 'สิทธิพื้นฐานของผู้มีเงินได้และผู้อยู่ในอุปการะ' },
  insurance: { label: 'ประกันและกองทุนภาคบังคับ', hint: 'เบี้ยประกันและเงินสมทบที่กฎหมายให้นำมาลดหย่อน' },
  investment: { label: 'กองทุนเพื่อการออมและการลงทุน', hint: 'ยอดรวมทุกกองทุนเพื่อการเกษียณต้องไม่เกิน 500,000 บาท' },
  housing: { label: 'ที่อยู่อาศัย', hint: 'ดอกเบี้ยเงินกู้เพื่อซื้อหรือสร้างที่อยู่อาศัย' },
  donation: { label: 'เงินบริจาค', hint: 'หักได้ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อนอื่น' },
}

export const DEDUCTION_ITEMS: DeductionItem[] = [
  {
    key: 'personal',
    label: 'ค่าลดหย่อนส่วนตัว',
    hint: 'ผู้มีเงินได้ทุกคนได้สิทธินี้อัตโนมัติ',
    group: 'personal',
    cap: 60_000,
    fixed: true,
    preset: 60_000,
  },
  {
    key: 'spouse',
    label: 'คู่สมรสที่ไม่มีเงินได้',
    hint: 'จดทะเบียนสมรสและคู่สมรสไม่มีเงินได้ในปีภาษีนั้น',
    group: 'personal',
    cap: 60_000,
  },
  {
    key: 'children',
    label: 'บุตร',
    hint: 'คนละ 30,000 บาท — บุตรคนที่ 2 ขึ้นไปที่เกิดตั้งแต่ปี 2561 ได้คนละ 60,000 บาท',
    group: 'personal',
    cap: null,
  },
  {
    key: 'parents',
    label: 'บิดามารดา',
    hint: 'คนละ 30,000 บาท อายุ 60 ปีขึ้นไปและมีเงินได้ไม่เกิน 30,000 บาทต่อปี (สูงสุด 4 คน)',
    group: 'personal',
    cap: 120_000,
  },
  {
    key: 'disabledCare',
    label: 'อุปการะคนพิการหรือทุพพลภาพ',
    hint: 'คนละ 60,000 บาท ตามจำนวนผู้อยู่ในอุปการะ',
    group: 'personal',
    cap: null,
  },
  {
    key: 'socialSecurity',
    label: 'เงินสมทบประกันสังคม',
    hint: 'ตามที่จ่ายจริง สูงสุด 9,000 บาทต่อปี',
    group: 'insurance',
    cap: 9_000,
  },
  {
    key: 'lifeInsurance',
    label: 'เบี้ยประกันชีวิต',
    hint: 'กรมธรรม์อายุ 10 ปีขึ้นไป — รวมกับประกันสุขภาพตนเองไม่เกิน 100,000 บาท',
    group: 'insurance',
    cap: 100_000,
  },
  {
    key: 'healthInsurance',
    label: 'เบี้ยประกันสุขภาพตนเอง',
    hint: 'สูงสุด 25,000 บาท และเมื่อรวมกับประกันชีวิตต้องไม่เกิน 100,000 บาท',
    group: 'insurance',
    cap: 25_000,
  },
  {
    key: 'parentHealthInsurance',
    label: 'เบี้ยประกันสุขภาพบิดามารดา',
    hint: 'สูงสุด 15,000 บาท ไม่ต้องดูอายุของบิดามารดา',
    group: 'insurance',
    cap: 15_000,
  },
  {
    key: 'providentFund',
    label: 'กองทุนสำรองเลี้ยงชีพ / กบข. / สงเคราะห์ครู',
    hint: 'ไม่เกิน 15% ของเงินได้ และไม่เกิน 500,000 บาท',
    group: 'investment',
    cap: 500_000,
    capRateOfIncome: 0.15,
  },
  {
    key: 'rmf',
    label: 'กองทุนรวมเพื่อการเลี้ยงชีพ (RMF)',
    hint: 'ไม่เกิน 30% ของเงินได้ และไม่เกิน 500,000 บาท',
    group: 'investment',
    cap: 500_000,
    capRateOfIncome: 0.3,
  },
  {
    key: 'ssf',
    label: 'กองทุนรวมเพื่อการออม (SSF)',
    hint: 'ไม่เกิน 30% ของเงินได้ และไม่เกิน 200,000 บาท',
    group: 'investment',
    cap: 200_000,
    capRateOfIncome: 0.3,
  },
  {
    key: 'thaiEsg',
    label: 'กองทุนรวมไทยเพื่อความยั่งยืน (Thai ESG)',
    hint: 'ไม่เกิน 30% ของเงินได้ และไม่เกิน 300,000 บาท',
    group: 'investment',
    cap: 300_000,
    capRateOfIncome: 0.3,
  },
  {
    key: 'nsf',
    label: 'กองทุนการออมแห่งชาติ (กอช.)',
    hint: 'ตามที่จ่ายจริง สูงสุด 30,000 บาทต่อปี',
    group: 'investment',
    cap: 30_000,
  },
  {
    key: 'pensionInsurance',
    label: 'เบี้ยประกันชีวิตแบบบำนาญ',
    hint: 'ไม่เกิน 15% ของเงินได้ และไม่เกิน 200,000 บาท',
    group: 'investment',
    cap: 200_000,
    capRateOfIncome: 0.15,
  },
  {
    key: 'mortgageInterest',
    label: 'ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย',
    hint: 'ตามที่จ่ายจริง สูงสุด 100,000 บาทต่อปี',
    group: 'housing',
    cap: 100_000,
  },
  {
    key: 'donationEducation',
    label: 'บริจาคเพื่อการศึกษา กีฬา และโรงพยาบาลรัฐ',
    hint: 'หักได้ 2 เท่าของที่จ่ายจริง แต่เมื่อรวมทุกรายการต้องไม่เกิน 10% ของเงินได้หลังหักค่าลดหย่อน',
    group: 'donation',
    cap: null,
    multiplier: 2,
  },
  {
    key: 'donationGeneral',
    label: 'บริจาคทั่วไป',
    hint: 'มูลนิธิและองค์กรสาธารณกุศลที่ประกาศกำหนด — ไม่เกิน 10% ของเงินได้หลังหักค่าลดหย่อน',
    group: 'donation',
    cap: null,
  },
]

/** เพดานรวมของกองทุนเพื่อการเกษียณ (PVD + RMF + SSF + กอช. + ประกันบำนาญ) */
export const RETIREMENT_POOL_CAP = 500_000
export const RETIREMENT_POOL_KEYS = ['providentFund', 'rmf', 'ssf', 'nsf', 'pensionInsurance']

/** เพดานรวมของประกันชีวิต + ประกันสุขภาพตนเอง */
export const LIFE_HEALTH_POOL_CAP = 100_000
export const LIFE_HEALTH_POOL_KEYS = ['lifeInsurance', 'healthInsurance']

/** สัดส่วนสูงสุดของเงินบริจาคที่หักได้ */
export const DONATION_RATE_CAP = 0.1

/* ---------- ตัวเลือกอื่นในแบบฟอร์ม ---------- */

export const FORM_TYPES = [
  {
    value: 'ภ.ง.ด.91',
    label: 'ภ.ง.ด.91 — มีเงินได้จากเงินเดือนอย่างเดียว',
    hint: 'ผู้มีเงินได้ตามมาตรา 40(1) ประเภทเดียว',
  },
  {
    value: 'ภ.ง.ด.90',
    label: 'ภ.ง.ด.90 — มีเงินได้หลายประเภท',
    hint: 'มีเงินได้ประเภทอื่นนอกจากเงินเดือน เช่น ฟรีแลนซ์ ค่าเช่า ธุรกิจ',
  },
] as const

export const TAX_YEARS = ['2568', '2567', '2566'] as const

export const MARITAL_STATUS = [
  { value: 'single', label: 'โสด' },
  { value: 'married_joint', label: 'สมรส — ยื่นรวมกับคู่สมรส' },
  { value: 'married_separate', label: 'สมรส — ยื่นแยกจากคู่สมรส' },
  { value: 'widowed', label: 'หม้าย' },
] as const

/** ประเภทเอกสารที่ระบบรับแนบในขั้นตอนลดหย่อน */
export const DOCUMENT_TYPES = [
  { value: 'wht50', label: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)' },
  { value: 'insurance', label: 'ใบเสร็จเบี้ยประกันชีวิต / สุขภาพ' },
  { value: 'fund', label: 'หนังสือรับรองกองทุน RMF / SSF / Thai ESG' },
  { value: 'mortgage', label: 'หนังสือรับรองดอกเบี้ยเงินกู้ที่อยู่อาศัย' },
  { value: 'donation', label: 'ใบอนุโมทนาบัตร / ใบเสร็จเงินบริจาค' },
  { value: 'other', label: 'เอกสารอื่น ๆ' },
] as const
