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
    key: 'severance',
    code: '40(1)',
    label: 'ค่าชดเชยเมื่อถูกเลิกจ้าง (ตามกฎหมายแรงงาน)',
    hint: 'ยกเว้นภาษีไม่เกิน 600,000 บาท (และไม่เกินค่าจ้าง 400 วันสุดท้าย) ส่วนที่เกินรวมเป็นเงินเดือน',
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
    key: 'savingsInterest',
    code: '40(4)',
    label: 'ดอกเบี้ยเงินฝากออมทรัพย์',
    hint: 'รวมทุกบัญชีทั้งปีไม่เกิน 20,000 บาท ได้รับยกเว้นทั้งจำนวน ถ้าเกินต้องนำมาเสียภาษีทั้งจำนวน',
    expenseRate: 0,
    expenseCap: null,
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
    label: 'ค่าเช่าบ้าน อาคาร และยานพาหนะ',
    hint: 'บ้าน โรงเรือน สิ่งปลูกสร้าง แพ และยานพาหนะ หักค่าใช้จ่ายเหมา 30%',
    expenseRate: 0.3,
    expenseCap: null,
  },
  {
    key: 'rentFarmland',
    code: '40(5)',
    label: 'ค่าเช่าที่ดินเพื่อเกษตรกรรม',
    hint: 'หักค่าใช้จ่ายเหมา 20%',
    expenseRate: 0.2,
    expenseCap: null,
  },
  {
    key: 'rentLand',
    code: '40(5)',
    label: 'ค่าเช่าที่ดินที่ไม่ได้ใช้ทำเกษตรกรรม',
    hint: 'หักค่าใช้จ่ายเหมา 15%',
    expenseRate: 0.15,
    expenseCap: null,
  },
  {
    key: 'rentOther',
    code: '40(5)',
    label: 'ค่าเช่าทรัพย์สินอื่น',
    hint: 'ทรัพย์สินที่ไม่เข้าประเภทข้างต้น เช่น เครื่องจักร อุปกรณ์ หักค่าใช้จ่ายเหมา 10%',
    expenseRate: 0.1,
    expenseCap: null,
  },
  {
    key: 'medical',
    code: '40(6)',
    label: 'วิชาชีพอิสระ — การประกอบโรคศิลปะ',
    hint: 'แพทย์ ทันตแพทย์ เภสัชกร และวิชาชีพด้านสุขภาพ หักค่าใช้จ่ายเหมา 60%',
    expenseRate: 0.6,
    expenseCap: null,
  },
  {
    key: 'profession',
    code: '40(6)',
    label: 'วิชาชีพอิสระอื่น',
    hint: 'กฎหมาย บัญชี วิศวกรรม สถาปัตยกรรม ประณีตศิลป์ หักค่าใช้จ่ายเหมา 30%',
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

export type DeductionGroup = 'personal' | 'insurance' | 'investment' | 'housing' | 'stimulus' | 'donation'

export interface DeductionItem {
  key: string
  label: string
  hint: string
  group: DeductionGroup
  /** เพดานเป็นจำนวนเงิน — null คือไม่จำกัดด้วยตัวเลขคงที่ */
  cap: number | null
  /** เพดานเพิ่มเติมคิดเป็นสัดส่วนของเงินได้ เช่น RMF 30% */
  capRateOfIncome?: number
  /** ฐานของเพดานตามสัดส่วน — gross = เงินได้พึงประเมินทั้งหมด, salary = ค่าจ้างตามมาตรา 40(1) */
  capRateBase?: 'gross' | 'salary'
  /** ยอดคงที่ที่บวกเพิ่มจากเพดานตามสัดส่วน (กองทุนสำรองเลี้ยงชีพ: 10,000 + 15% ของค่าจ้าง) */
  capBase?: number
  /** เพดานที่ต่างกันในแต่ละปีภาษี (ทับ cap) */
  capByYear?: Record<string, number>
  /** ปีภาษีที่มีสิทธินี้ — ไม่ระบุคือทุกปี */
  years?: string[]
  /** หักได้ทุก ๆ 1,000,000 บาทของยอดที่กรอก (ค่าสร้างบ้านใหม่ 10,000 ต่อทุก 1 ล้าน) */
  perMillion?: number
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
  housing: { label: 'ที่อยู่อาศัย', hint: 'ดอกเบี้ยเงินกู้เพื่อซื้อหรือสร้างที่อยู่อาศัย และค่าสร้างบ้านใหม่' },
  stimulus: {
    label: 'มาตรการกระตุ้นเศรษฐกิจ',
    hint: 'สิทธิชั่วคราวที่มีเฉพาะบางปีภาษี ระบบแสดงเฉพาะรายการของปีที่เลือก',
  },
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
    key: 'prenatal',
    label: 'ค่าฝากครรภ์และคลอดบุตร',
    hint: 'ตามที่จ่ายจริง ไม่เกิน 60,000 บาทต่อการตั้งครรภ์แต่ละครั้ง',
    group: 'personal',
    cap: 60_000,
  },
  {
    key: 'socialSecurity',
    label: 'เงินสมทบประกันสังคม',
    hint: 'ตามที่จ่ายจริง สูงสุด 9,000 บาทต่อปี (ปีภาษี 2569 สูงสุด 10,500 บาท ตามเพดานค่าจ้างใหม่ 17,500 บาท)',
    group: 'insurance',
    cap: 9_000,
    capByYear: { '2569': 10_500 },
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
    key: 'spouseLifeInsurance',
    label: 'เบี้ยประกันชีวิตของคู่สมรสที่ไม่มีเงินได้',
    hint: 'ตามที่จ่ายจริง ไม่เกิน 10,000 บาท ต้องเป็นสามีภริยากันตลอดปีภาษี',
    group: 'insurance',
    cap: 10_000,
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
    label: 'กองทุนสำรองเลี้ยงชีพ',
    hint: 'ลดหย่อน 10,000 บาท ส่วนที่เกินยกเว้นได้ไม่เกิน 15% ของค่าจ้าง (เงินได้ 40(1)) รวมไม่เกิน 500,000 บาท',
    group: 'investment',
    cap: 500_000,
    capRateOfIncome: 0.15,
    capRateBase: 'salary',
    capBase: 10_000,
  },
  {
    key: 'gpf',
    label: 'กบข. / กองทุนสงเคราะห์ครูโรงเรียนเอกชน',
    hint: 'หักได้เท่าที่จ่ายจริง ไม่เกิน 500,000 บาท และนับรวมในเพดานกองทุนเพื่อการเกษียณ',
    group: 'investment',
    cap: 500_000,
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
    hint: 'ไม่เกิน 30% ของเงินได้ และไม่เกิน 200,000 บาท — ใช้สิทธิได้ถึงปีภาษี 2567 เท่านั้น',
    group: 'investment',
    cap: 200_000,
    capRateOfIncome: 0.3,
    years: ['2566', '2567'],
  },
  {
    key: 'thaiEsg',
    label: 'กองทุนรวมไทยเพื่อความยั่งยืน (Thai ESG)',
    hint: 'ไม่เกิน 30% ของเงินได้ และไม่เกิน 300,000 บาท (ปีภาษี 2566 เพดาน 100,000 บาท) ไม่นับรวมเพดานกองทุนเกษียณ',
    group: 'investment',
    cap: 300_000,
    capByYear: { '2566': 100_000 },
    capRateOfIncome: 0.3,
  },
  {
    key: 'thaiEsgxNew',
    label: 'Thai ESGX — เงินลงทุนใหม่',
    hint: 'เฉพาะปีภาษี 2568 ไม่เกิน 30% ของเงินได้ และไม่เกิน 300,000 บาท แยกจากวงเงิน Thai ESG ปกติ',
    group: 'investment',
    cap: 300_000,
    capRateOfIncome: 0.3,
    years: ['2568'],
  },
  {
    key: 'thaiEsgxLtf',
    label: 'Thai ESGX — สับเปลี่ยนจาก LTF',
    hint: 'ปีภาษี 2568 ไม่เกิน 300,000 บาท ปี 2569–2572 ปีละไม่เกิน 50,000 บาท',
    group: 'investment',
    cap: 50_000,
    capByYear: { '2568': 300_000 },
    years: ['2568', '2569'],
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
    key: 'newHouse',
    label: 'ค่าสร้างบ้านใหม่',
    hint: 'กรอกค่าก่อสร้างทั้งหมด หักได้ 10,000 บาทต่อทุก 1 ล้านบาท สูงสุด 100,000 บาท (สัญญากับผู้รับจ้างที่จด VAT ปี 2567–2568)',
    group: 'housing',
    cap: 100_000,
    perMillion: 10_000,
    years: ['2567', '2568'],
  },
  {
    key: 'easyReceipt',
    label: 'Easy E-Receipt — ซื้อสินค้าและบริการทั่วไป',
    hint: 'มีใบกำกับภาษีอิเล็กทรอนิกส์ ปี 2566 สูงสุด 40,000 · ปี 2567 สูงสุด 50,000 · ปี 2568 สูงสุด 30,000 บาท',
    group: 'stimulus',
    cap: 30_000,
    capByYear: { '2566': 40_000, '2567': 50_000, '2568': 30_000 },
    years: ['2566', '2567', '2568'],
  },
  {
    key: 'easyReceiptCommunity',
    label: 'Easy E-Receipt — วิสาหกิจชุมชน OTOP และวิสาหกิจเพื่อสังคม',
    hint: 'เฉพาะปีภาษี 2568 เพิ่มได้อีกไม่เกิน 20,000 บาท',
    group: 'stimulus',
    cap: 20_000,
    years: ['2568'],
  },
  {
    key: 'socialEnterprise',
    label: 'ลงทุนในวิสาหกิจเพื่อสังคม',
    hint: 'ซื้อหุ้นหรือเป็นหุ้นส่วนในวิสาหกิจเพื่อสังคมที่จดทะเบียน ไม่เกิน 100,000 บาท',
    group: 'stimulus',
    cap: 100_000,
    years: ['2567'],
  },
  {
    key: 'domesticTravel',
    label: 'ค่าท่องเที่ยวเมืองรอง',
    hint: '1 พ.ค. – 30 พ.ย. 2567 ไม่เกิน 15,000 บาท',
    group: 'stimulus',
    cap: 15_000,
    years: ['2567'],
  },
  {
    key: 'floodHouseRepair',
    label: 'ค่าซ่อมบ้านจากอุทกภัย',
    hint: '16 ส.ค. – 31 ธ.ค. 2567 ไม่เกิน 100,000 บาท',
    group: 'stimulus',
    cap: 100_000,
    years: ['2567'],
  },
  {
    key: 'floodCarRepair',
    label: 'ค่าซ่อมรถจากอุทกภัย',
    hint: '16 ส.ค. – 31 ธ.ค. 2567 ไม่เกิน 30,000 บาท',
    group: 'stimulus',
    cap: 30_000,
    years: ['2567'],
  },
  {
    key: 'politicalDonation',
    label: 'บริจาคให้พรรคการเมือง',
    hint: 'ไม่เกิน 10,000 บาท หักเป็นค่าลดหย่อน แยกจากเพดาน 10% ของเงินบริจาคทั่วไป',
    group: 'donation',
    cap: 10_000,
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
export const RETIREMENT_POOL_KEYS = ['providentFund', 'gpf', 'rmf', 'ssf', 'nsf', 'pensionInsurance']

/** เงินบริจาคที่คิดเพดาน 10% แยกต่างหาก (หักหลังค่าลดหย่อนอื่นทั้งหมด) */
export const DONATION_KEYS = ['donationEducation', 'donationGeneral']

/** ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ ได้รับยกเว้นเงินได้ (หักก่อนค่าใช้จ่าย) */
export const SENIOR_EXEMPTION = 190_000
export const SENIOR_AGE = 65

/** ค่าชดเชยเลิกจ้างตามกฎหมายแรงงาน ได้รับยกเว้นไม่เกินจำนวนนี้ (ตั้งแต่ปีภาษี 2566) */
export const SEVERANCE_EXEMPTION = 600_000
/** ดอกเบี้ยออมทรัพย์ทั้งปีไม่เกินจำนวนนี้ได้รับยกเว้น */
export const SAVINGS_INTEREST_EXEMPTION = 20_000

/** เงินได้ที่เลือกหักค่าใช้จ่ายตามจริงแทนแบบเหมาได้ */
export const ACTUAL_EXPENSE_CODES = ['40(5)', '40(6)', '40(7)', '40(8)']

/** ปีภาษีที่ใช้เมื่อไม่ได้ระบุ — ปีปัจจุบันที่ยังสะสมเงินได้อยู่ */
export const DEFAULT_TAX_YEAR = '2569'

/** รายการลดหย่อนนี้มีสิทธิในปีภาษีนั้นหรือไม่ */
export function isDeductionAvailable(item: DeductionItem, taxYear: string): boolean {
  return !item.years || item.years.includes(taxYear)
}

/** เพดานของรายการในปีภาษีนั้น */
export function deductionCapFor(item: DeductionItem, taxYear: string): number | null {
  return item.capByYear?.[taxYear] ?? item.cap
}

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

export const TAX_YEARS = ['2569', '2568', '2567', '2566'] as const

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
  { value: 'prenatal', label: 'ใบเสร็จค่าฝากครรภ์และคลอดบุตร' },
  { value: 'eReceipt', label: 'ใบกำกับภาษีอิเล็กทรอนิกส์ (Easy E-Receipt)' },
  { value: 'house', label: 'สัญญาและใบกำกับภาษีค่าสร้างบ้าน' },
  { value: 'expense', label: 'หลักฐานค่าใช้จ่ายจริง (40(5)–40(8))' },
  { value: 'other', label: 'เอกสารอื่น ๆ' },
] as const
