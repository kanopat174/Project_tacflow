/**
 * โหมดการใช้งานของสมุดบัญชี — 6 แบบ แต่ละแบบมีหมวดรายรับรายจ่ายและเกณฑ์ความเสี่ยงของตัวเอง
 *
 * แยกโหมดเพราะคนแต่ละกลุ่มดูตัวเลขคนละชุด
 * มนุษย์เงินเดือนสนใจอัตราการออม ฟรีแลนซ์สนใจภาษีหัก ณ ที่จ่าย
 * ธุรกิจสนใจกำไรขั้นต้น ส่วนเทรดเดอร์สนใจอัตราชนะและ profit factor
 */

export type WorkspaceMode = 'personal' | 'freelancer' | 'sme' | 'company' | 'investor' | 'trader'

export type EntryType = 'income' | 'expense'

export interface Category {
  key: string
  label: string
  type: EntryType
  /** ต้นทุนขาย ใช้แยกคำนวณกำไรขั้นต้น */
  isCogs?: boolean
  /** รายจ่ายที่จำเป็นต่อการดำรงชีพ ใช้คำนวณเงินสำรองฉุกเฉิน */
  essential?: boolean
}

export interface ModeDefinition {
  key: WorkspaceMode
  label: string
  tagline: string
  icon: string
  /** จำนวนเดือนของเงินสำรองที่ควรมี ตามลักษณะความผันผวนของรายได้ */
  recommendedRunwayMonths: number
  /** สัดส่วนการออมที่ควรทำได้ต่อเดือน */
  targetSavingsRate: number
  /** คำที่ใช้เรียกเงินทุนตั้งต้นในโหมดนี้ */
  capitalLabel: string
  categories: Category[]
  /** ตัวชี้วัดพิเศษที่โหมดนี้ต้องการ */
  features: {
    withholdingTax?: boolean
    vat?: boolean
    grossProfit?: boolean
    tradingStats?: boolean
  }
}

const personal: Category[] = [
  { key: 'salary', label: 'เงินเดือน', type: 'income' },
  { key: 'bonus', label: 'โบนัสและค่าล่วงเวลา', type: 'income' },
  { key: 'sideIncome', label: 'รายได้เสริม', type: 'income' },
  { key: 'investmentIncome', label: 'ดอกเบี้ยและเงินปันผล', type: 'income' },
  { key: 'otherIncome', label: 'รายได้อื่น', type: 'income' },
  { key: 'housing', label: 'ที่อยู่อาศัย', type: 'expense', essential: true },
  { key: 'food', label: 'อาหารและของใช้', type: 'expense', essential: true },
  { key: 'transport', label: 'เดินทาง', type: 'expense', essential: true },
  { key: 'utilities', label: 'สาธารณูปโภคและสื่อสาร', type: 'expense', essential: true },
  { key: 'health', label: 'สุขภาพและรักษาพยาบาล', type: 'expense', essential: true },
  { key: 'debt', label: 'ผ่อนชำระหนี้', type: 'expense', essential: true },
  { key: 'insurance', label: 'เบี้ยประกัน', type: 'expense', essential: true },
  { key: 'education', label: 'การศึกษา', type: 'expense' },
  { key: 'lifestyle', label: 'ช้อปปิ้งและบันเทิง', type: 'expense' },
  { key: 'savingInvest', label: 'ออมและลงทุน', type: 'expense' },
  { key: 'otherExpense', label: 'รายจ่ายอื่น', type: 'expense' },
]

const freelancer: Category[] = [
  { key: 'projectFee', label: 'ค่าจ้างงานโครงการ', type: 'income' },
  { key: 'retainer', label: 'ค่ารีเทนเนอร์รายเดือน', type: 'income' },
  { key: 'royalty', label: 'ค่าลิขสิทธิ์และค่าสิทธิ', type: 'income' },
  { key: 'teaching', label: 'งานสอนและบรรยาย', type: 'income' },
  { key: 'otherIncome', label: 'รายได้อื่น', type: 'income' },
  { key: 'subcontract', label: 'ค่าจ้างผู้ช่วยและซับคอนแทรค', type: 'expense' },
  { key: 'software', label: 'ซอฟต์แวร์และเครื่องมือ', type: 'expense', essential: true },
  { key: 'equipment', label: 'อุปกรณ์และคอมพิวเตอร์', type: 'expense' },
  { key: 'workTravel', label: 'เดินทางเพื่องาน', type: 'expense' },
  { key: 'marketing', label: 'การตลาดและหาลูกค้า', type: 'expense' },
  { key: 'platformFee', label: 'ค่าธรรมเนียมแพลตฟอร์ม', type: 'expense' },
  { key: 'socialSecurity', label: 'ประกันสังคมมาตรา 39/40', type: 'expense', essential: true },
  { key: 'personalDraw', label: 'ถอนไปใช้ส่วนตัว', type: 'expense', essential: true },
  { key: 'otherExpense', label: 'รายจ่ายอื่น', type: 'expense' },
]

const sme: Category[] = [
  { key: 'productSales', label: 'ขายสินค้า', type: 'income' },
  { key: 'serviceIncome', label: 'รายได้ค่าบริการ', type: 'income' },
  { key: 'otherIncome', label: 'รายได้อื่น', type: 'income' },
  { key: 'cogs', label: 'ต้นทุนสินค้าที่ขาย', type: 'expense', isCogs: true, essential: true },
  { key: 'staff', label: 'เงินเดือนพนักงาน', type: 'expense', essential: true },
  { key: 'rent', label: 'ค่าเช่าสถานที่', type: 'expense', essential: true },
  { key: 'utilities', label: 'สาธารณูปโภค', type: 'expense', essential: true },
  { key: 'marketing', label: 'การตลาดและโฆษณา', type: 'expense' },
  { key: 'logistics', label: 'ขนส่งและบรรจุภัณฑ์', type: 'expense' },
  { key: 'bankFee', label: 'ค่าธรรมเนียมธนาคารและชำระเงิน', type: 'expense' },
  { key: 'taxFee', label: 'ภาษีและค่าธรรมเนียมราชการ', type: 'expense', essential: true },
  { key: 'otherExpense', label: 'รายจ่ายอื่น', type: 'expense' },
]

const company: Category[] = [
  { key: 'sales', label: 'รายได้จากการขาย', type: 'income' },
  { key: 'services', label: 'รายได้จากการบริการ', type: 'income' },
  { key: 'interestIncome', label: 'รายได้ดอกเบี้ย', type: 'income' },
  { key: 'otherIncome', label: 'รายได้อื่น', type: 'income' },
  { key: 'cogs', label: 'ต้นทุนขาย', type: 'expense', isCogs: true, essential: true },
  { key: 'payroll', label: 'เงินเดือนและสวัสดิการ', type: 'expense', essential: true },
  { key: 'premises', label: 'ค่าเช่าและสาธารณูปโภค', type: 'expense', essential: true },
  { key: 'depreciation', label: 'ค่าเสื่อมราคา', type: 'expense' },
  { key: 'professional', label: 'ค่าที่ปรึกษาและวิชาชีพ', type: 'expense' },
  { key: 'marketing', label: 'การตลาด', type: 'expense' },
  { key: 'interestExpense', label: 'ดอกเบี้ยจ่าย', type: 'expense', essential: true },
  { key: 'corporateTax', label: 'ภาษีเงินได้นิติบุคคล', type: 'expense', essential: true },
  { key: 'otherExpense', label: 'รายจ่ายอื่น', type: 'expense' },
]

const investor: Category[] = [
  { key: 'dividend', label: 'เงินปันผล', type: 'income' },
  { key: 'interest', label: 'ดอกเบี้ย', type: 'income' },
  { key: 'realisedGain', label: 'กำไรจากการขายที่รับรู้แล้ว', type: 'income' },
  { key: 'rentalIncome', label: 'ค่าเช่าอสังหาริมทรัพย์', type: 'income' },
  { key: 'contribution', label: 'เงินลงทุนเพิ่ม', type: 'expense' },
  { key: 'realisedLoss', label: 'ขาดทุนจากการขายที่รับรู้แล้ว', type: 'expense' },
  { key: 'brokerFee', label: 'ค่าธรรมเนียมซื้อขาย', type: 'expense' },
  { key: 'managementFee', label: 'ค่าธรรมเนียมจัดการกองทุน', type: 'expense' },
  { key: 'marginInterest', label: 'ดอกเบี้ยมาร์จิ้น', type: 'expense' },
  { key: 'withheldTax', label: 'ภาษีหัก ณ ที่จ่าย', type: 'expense' },
  { key: 'otherExpense', label: 'รายจ่ายอื่น', type: 'expense' },
]

const trader: Category[] = [
  { key: 'tradeProfit', label: 'กำไรจากการเทรด', type: 'income' },
  { key: 'rebate', label: 'ค่ารีเบตและโบนัสโบรกเกอร์', type: 'income' },
  { key: 'tradeLoss', label: 'ขาดทุนจากการเทรด', type: 'expense' },
  { key: 'commission', label: 'ค่าคอมมิชชัน', type: 'expense' },
  { key: 'swap', label: 'ค่าสเปรดและสวอป', type: 'expense' },
  { key: 'dataFee', label: 'ค่าข้อมูลและแพลตฟอร์ม', type: 'expense', essential: true },
  { key: 'otherExpense', label: 'รายจ่ายอื่น', type: 'expense' },
]

export const WORKSPACE_MODES: ModeDefinition[] = [
  {
    key: 'personal',
    label: 'การเงินส่วนบุคคล',
    tagline: 'ติดตามรายรับรายจ่ายประจำวัน ดูอัตราการออม และเงินสำรองฉุกเฉิน',
    icon: 'wallet',
    recommendedRunwayMonths: 6,
    targetSavingsRate: 0.2,
    capitalLabel: 'เงินเก็บตั้งต้น',
    categories: personal,
    features: {},
  },
  {
    key: 'freelancer',
    label: 'ฟรีแลนซ์',
    tagline: 'รายรับ รายจ่าย และภาษีหัก ณ ที่จ่าย สำหรับคนรับงานอิสระ',
    icon: 'file',
    recommendedRunwayMonths: 12,
    targetSavingsRate: 0.3,
    capitalLabel: 'เงินทุนหมุนเวียนตั้งต้น',
    categories: freelancer,
    features: { withholdingTax: true },
  },
  {
    key: 'sme',
    label: 'ธุรกิจขนาดเล็ก',
    tagline: 'รายรับรายจ่ายร้านค้า พร้อมกำไรขั้นต้นและภาษีมูลค่าเพิ่ม',
    icon: 'receipt',
    recommendedRunwayMonths: 12,
    targetSavingsRate: 0.15,
    capitalLabel: 'เงินทุนตั้งต้น',
    categories: sme,
    features: { vat: true, grossProfit: true },
  },
  {
    key: 'company',
    label: 'บริษัท',
    tagline: 'บัญชีรายรับรายจ่ายระดับนิติบุคคล พร้อมกำไรขั้นต้นและภาษี',
    icon: 'chart',
    recommendedRunwayMonths: 12,
    targetSavingsRate: 0.15,
    capitalLabel: 'ทุนจดทะเบียนที่ชำระแล้ว',
    categories: company,
    features: { vat: true, grossProfit: true, withholdingTax: true },
  },
  {
    key: 'investor',
    label: 'นักลงทุน',
    tagline: 'กระแสเงินสดจากพอร์ตลงทุน เงินปันผล ดอกเบี้ย และค่าธรรมเนียม',
    icon: 'spark',
    recommendedRunwayMonths: 6,
    targetSavingsRate: 0.25,
    capitalLabel: 'เงินลงทุนตั้งต้น',
    categories: investor,
    features: {},
  },
  {
    key: 'trader',
    label: 'เทรดเดอร์',
    tagline: 'สมุดบันทึกการเทรด กำไรขาดทุน อัตราชนะ และ profit factor',
    icon: 'chart',
    recommendedRunwayMonths: 12,
    targetSavingsRate: 0.2,
    capitalLabel: 'เงินทุนในพอร์ต',
    categories: trader,
    features: { tradingStats: true },
  },
]

export function modeDefinition(mode: WorkspaceMode): ModeDefinition {
  return WORKSPACE_MODES.find((m) => m.key === mode) ?? WORKSPACE_MODES[0]!
}

export function categoriesOf(mode: WorkspaceMode, type?: EntryType): Category[] {
  const list = modeDefinition(mode).categories
  return type ? list.filter((c) => c.type === type) : list
}

/**
 * ชื่อหมวดสำหรับแสดงผล
 *
 * หน้าแดชบอร์ดรวมรายการจากทุกสมุดซึ่งอาจคนละโหมด ทำให้ถามหาหมวดที่ไม่มีในโหมดที่ส่งมาได้
 * จึงต้องหาข้ามโหมดให้ด้วย ไม่งั้นคีย์ภาษาอังกฤษอย่าง cogs จะหลุดไปโชว์ผู้ใช้
 */
export function categoryLabel(mode: WorkspaceMode, key: string): string {
  const own = modeDefinition(mode).categories.find((c) => c.key === key)
  if (own) return own.label

  for (const definition of WORKSPACE_MODES) {
    const found = definition.categories.find((c) => c.key === key)
    if (found) return found.label
  }
  return 'อื่น ๆ'
}

/* ---------- เป้าหมาย ---------- */

export type GoalKind = 'save' | 'income' | 'expenseCap' | 'runway'

export const GOAL_KINDS = [
  {
    value: 'save' as const,
    label: 'เก็บเงินให้ถึงเป้า',
    hint: 'สะสมเงินคงเหลือสุทธิให้ถึงจำนวนที่ตั้งไว้',
    unit: 'บาท',
  },
  {
    value: 'income' as const,
    label: 'รายรับต่อเดือน',
    hint: 'ทำรายรับเฉลี่ยต่อเดือนให้ถึงเป้า',
    unit: 'บาทต่อเดือน',
  },
  {
    value: 'expenseCap' as const,
    label: 'คุมรายจ่ายต่อเดือน',
    hint: 'รักษารายจ่ายเฉลี่ยต่อเดือนไม่ให้เกินเพดาน',
    unit: 'บาทต่อเดือน',
  },
  {
    value: 'runway' as const,
    label: 'เงินสำรองให้อยู่ได้กี่เดือน',
    hint: 'สะสมเงินสำรองให้ครอบคลุมรายจ่ายตามจำนวนเดือนที่ตั้งไว้',
    unit: 'เดือน',
  },
]
