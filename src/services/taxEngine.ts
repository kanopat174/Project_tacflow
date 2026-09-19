/**
 * เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา — ฟังก์ชันบริสุทธิ์ทั้งหมด (ไม่แตะ DOM/แหล่งข้อมูลภายนอก)
 * จึงเขียนเทสต์ตรวจได้ และหน้าไหนก็เรียกใช้ได้เหมือนกัน
 *
 * ลำดับการคำนวณตามประมวลรัษฎากร:
 *   เงินได้พึงประเมิน − ค่าใช้จ่าย − ค่าลดหย่อน (ยกเว้นบริจาค)
 *   − บริจาคเพื่อการศึกษา (2 เท่า, ≤ 10%) − บริจาคทั่วไป (≤ 10% ของยอดที่เหลือ)
 *   = เงินได้สุทธิ → คำนวณภาษีตามอัตราขั้นบันได
 */

import {
  DEDUCTION_ITEMS,
  DONATION_RATE_CAP,
  INCOME_CATEGORIES,
  LIFE_HEALTH_POOL_CAP,
  LIFE_HEALTH_POOL_KEYS,
  RETIREMENT_POOL_CAP,
  RETIREMENT_POOL_KEYS,
  TAX_BRACKETS,
} from '@/data/taxData'

export type AmountMap = Record<string, number>

export interface ExpenseLine {
  key: string
  code: string
  label: string
  income: number
  expense: number
  /** ค่าใช้จ่ายถูกตัดด้วยเพดานหรือไม่ (ใช้เตือนผู้ใช้ในหน้าจอ) */
  cappedByLimit: boolean
}

export interface DeductionLine {
  key: string
  label: string
  /** จำนวนที่ผู้ใช้กรอก */
  entered: number
  /** จำนวนที่นำไปหักได้จริงหลังตัดเพดานทุกชั้น */
  allowed: number
  /** เพดานที่ใช้ตัดจริงกับรายการนี้ — null คือไม่มีเพดาน */
  limit: number | null
  /** เหตุผลที่ถูกตัด — ว่างคือไม่ถูกตัด */
  cappedReason: string
}

export interface BracketLine {
  label: string
  rate: number
  /** เงินได้สุทธิส่วนที่ตกในขั้นนี้ */
  amount: number
  tax: number
}

export interface TaxResult {
  grossIncome: number
  totalExpense: number
  incomeAfterExpense: number
  totalDeduction: number
  /** ค่าลดหย่อนที่ไม่ใช่เงินบริจาค */
  generalDeduction: number
  donationDeduction: number
  netIncome: number
  tax: number
  withholdingTax: number
  /** > 0 คือต้องชำระเพิ่ม, < 0 คือขอคืนได้ */
  balance: number
  /** อัตราภาษีที่แท้จริงเทียบกับเงินได้พึงประเมิน */
  effectiveRate: number
  /** อัตราของขั้นสูงสุดที่เงินได้ไปถึง */
  marginalRate: number
  expenseLines: ExpenseLine[]
  deductionLines: DeductionLine[]
  bracketLines: BracketLine[]
}

const INF = Number.POSITIVE_INFINITY

/** กันค่าติดลบ/NaN ที่หลุดมาจากช่องกรอก */
function clean(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** ภาษีตามอัตราขั้นบันได พร้อมรายละเอียดแต่ละขั้น */
export function calculateBrackets(netIncome: number): BracketLine[] {
  const lines: BracketLine[] = []
  let previousCap = 0

  for (const bracket of TAX_BRACKETS) {
    const amount = Math.max(0, Math.min(netIncome, bracket.cap) - previousCap)
    lines.push({
      label: bracket.label,
      rate: bracket.rate,
      amount,
      tax: amount * bracket.rate,
    })
    previousCap = bracket.cap
    if (netIncome <= previousCap) break
  }

  return lines
}

/** ภาษีที่ต้องเสียจากเงินได้สุทธิ */
export function calculateProgressiveTax(netIncome: number): number {
  return calculateBrackets(clean(netIncome)).reduce((sum, line) => sum + line.tax, 0)
}

/** ค่าใช้จ่ายแบบเหมาของเงินได้แต่ละประเภท (40(1) กับ 40(2) ใช้เพดานร่วมกัน) */
export function calculateExpenses(income: AmountMap): ExpenseLine[] {
  // รวมเงินได้ของแต่ละกลุ่มที่ใช้เพดานร่วมกันก่อน แล้วค่อยเฉลี่ยค่าใช้จ่ายกลับเข้าแต่ละประเภท
  const poolIncome: Record<string, number> = {}
  for (const category of INCOME_CATEGORIES) {
    if (!category.expensePool) continue
    poolIncome[category.expensePool] =
      (poolIncome[category.expensePool] ?? 0) + clean(income[category.key])
  }

  return INCOME_CATEGORIES.map((category) => {
    const amount = clean(income[category.key])
    const cap = category.expenseCap ?? INF
    let expense: number
    let cappedByLimit = false

    if (category.expensePool) {
      const total = poolIncome[category.expensePool] ?? 0
      const poolExpense = Math.min(total * category.expenseRate, cap)
      cappedByLimit = total * category.expenseRate > cap
      // แบ่งค่าใช้จ่ายของกลุ่มตามสัดส่วนเงินได้ เพื่อให้ยอดรวมยังตรงกับเพดาน
      expense = total > 0 ? (poolExpense * amount) / total : 0
    } else {
      const raw = amount * category.expenseRate
      expense = Math.min(raw, cap)
      cappedByLimit = raw > cap
    }

    return {
      key: category.key,
      code: category.code,
      label: category.label,
      income: amount,
      expense,
      cappedByLimit: cappedByLimit && amount > 0,
    }
  })
}

/**
 * ตัดเพดานค่าลดหย่อนทีละชั้น: เพดานรายการ → เพดานตามสัดส่วนเงินได้ →
 * เพดานรวมของกลุ่ม (กองทุนเกษียณ 500,000 / ประกันชีวิต+สุขภาพ 100,000)
 */
function applyDeductionLimits(deductions: AmountMap, grossIncome: number): DeductionLine[] {
  const lines: DeductionLine[] = DEDUCTION_ITEMS.filter((item) => item.group !== 'donation').map(
    (item) => {
      const entered = item.fixed ? (item.preset ?? item.cap ?? 0) : clean(deductions[item.key])
      const itemCap = item.cap ?? INF
      const rateCap = item.capRateOfIncome ? grossIncome * item.capRateOfIncome : INF
      const limit = Math.min(itemCap, rateCap)
      const allowed = Math.min(entered, limit)

      let cappedReason = ''
      if (entered > limit) {
        cappedReason =
          rateCap < itemCap
            ? `เกินเพดาน ${(item.capRateOfIncome ?? 0) * 100}% ของเงินได้`
            : 'เกินเพดานของรายการนี้'
      }

      return {
        key: item.key,
        label: item.label,
        entered,
        allowed,
        limit: Number.isFinite(limit) ? limit : null,
        cappedReason,
      }
    },
  )

  const byKey = new Map(lines.map((line) => [line.key, line]))

  // เพดานรวมของกลุ่ม: ตัดยอดส่วนเกินจากรายการท้ายกลุ่มขึ้นมา ให้ยอดรวมพอดีเพดาน
  const trimPool = (keys: string[], poolCap: number, reason: string) => {
    const pool = keys.map((key) => byKey.get(key)).filter((line): line is DeductionLine => !!line)
    let total = pool.reduce((sum, line) => sum + line.allowed, 0)
    for (let i = pool.length - 1; i >= 0 && total > poolCap; i--) {
      const line = pool[i]
      if (!line) continue
      const reduction = Math.min(line.allowed, total - poolCap)
      line.allowed -= reduction
      line.cappedReason = reason
      total -= reduction
    }
  }

  trimPool(LIFE_HEALTH_POOL_KEYS, LIFE_HEALTH_POOL_CAP, 'เกินเพดานรวมประกันชีวิต + สุขภาพ 100,000 บาท')
  trimPool(RETIREMENT_POOL_KEYS, RETIREMENT_POOL_CAP, 'เกินเพดานรวมกองทุนเพื่อการเกษียณ 500,000 บาท')

  return lines
}

/** คำนวณภาษีทั้งชุดจากเงินได้ ค่าลดหย่อน และภาษีที่ถูกหักไว้ */
export function calculateTax(
  income: AmountMap,
  deductions: AmountMap,
  withholdingTax = 0,
): TaxResult {
  const expenseLines = calculateExpenses(income)
  const grossIncome = expenseLines.reduce((sum, line) => sum + line.income, 0)
  const totalExpense = expenseLines.reduce((sum, line) => sum + line.expense, 0)
  const incomeAfterExpense = Math.max(0, grossIncome - totalExpense)

  const generalLines = applyDeductionLimits(deductions, grossIncome)
  const generalDeduction = generalLines.reduce((sum, line) => sum + line.allowed, 0)
  const baseBeforeDonation = Math.max(0, incomeAfterExpense - generalDeduction)

  // บริจาคเพื่อการศึกษาหักได้ 2 เท่า แต่ไม่เกิน 10% ของฐานก่อนบริจาค
  const educationPaid = clean(deductions.donationEducation)
  const educationLimit = baseBeforeDonation * DONATION_RATE_CAP
  const educationAllowed = Math.min(educationPaid * 2, educationLimit)

  // บริจาคทั่วไปคิดเพดาน 10% จากยอดที่เหลือหลังหักบริจาคเพื่อการศึกษาแล้ว
  const generalDonationPaid = clean(deductions.donationGeneral)
  const remainingBase = Math.max(0, baseBeforeDonation - educationAllowed)
  const generalDonationLimit = remainingBase * DONATION_RATE_CAP
  const generalDonationAllowed = Math.min(generalDonationPaid, generalDonationLimit)

  const donationLines: DeductionLine[] = [
    {
      key: 'donationEducation',
      label: 'บริจาคเพื่อการศึกษา กีฬา และโรงพยาบาลรัฐ',
      entered: educationPaid,
      allowed: educationAllowed,
      limit: educationLimit,
      cappedReason: educationPaid * 2 > educationLimit ? 'เกินเพดาน 10% ของเงินได้หลังหักค่าลดหย่อน' : '',
    },
    {
      key: 'donationGeneral',
      label: 'บริจาคทั่วไป',
      entered: generalDonationPaid,
      allowed: generalDonationAllowed,
      limit: generalDonationLimit,
      cappedReason:
        generalDonationPaid > generalDonationLimit ? 'เกินเพดาน 10% ของยอดคงเหลือ' : '',
    },
  ]

  const donationDeduction = educationAllowed + generalDonationAllowed
  const netIncome = Math.max(0, baseBeforeDonation - donationDeduction)
  const bracketLines = calculateBrackets(netIncome)
  const tax = bracketLines.reduce((sum, line) => sum + line.tax, 0)
  const paid = clean(withholdingTax)

  const reachedBrackets = bracketLines.filter((line) => line.amount > 0)
  const marginalRate = reachedBrackets[reachedBrackets.length - 1]?.rate ?? 0

  return {
    grossIncome,
    totalExpense,
    incomeAfterExpense,
    totalDeduction: generalDeduction + donationDeduction,
    generalDeduction,
    donationDeduction,
    netIncome,
    tax,
    withholdingTax: paid,
    balance: tax - paid,
    effectiveRate: grossIncome > 0 ? tax / grossIncome : 0,
    marginalRate,
    expenseLines,
    deductionLines: [...generalLines, ...donationLines],
    bracketLines,
  }
}

/**
 * ประหยัดภาษีได้เท่าไรถ้าลดหย่อนเพิ่มอีก 1 บาท — ใช้แนะนำผู้ใช้ในหน้าค่าลดหย่อน
 * คืนค่าเป็นจำนวนเงินภาษีที่ลดลงเมื่อลดหย่อนเพิ่มตามจำนวนที่ระบุ
 */
export function savingsFromExtraDeduction(netIncome: number, extra: number): number {
  const before = calculateProgressiveTax(netIncome)
  const after = calculateProgressiveTax(Math.max(0, netIncome - clean(extra)))
  return before - after
}

/**
 * ปัดจำนวนเงินให้เหลือทศนิยม 2 ตำแหน่ง (หน่วยสตางค์) แบบปัดครึ่งขึ้น
 *
 * จำเป็นสำหรับภาษีมูลค่าเพิ่มและภาษีหัก ณ ที่จ่าย ที่คิดเป็นเปอร์เซ็นต์ของยอดเงิน
 * เพราะเลขทศนิยมฐานสองทำให้ได้ค่าอย่าง 21000.000000000004
 *
 * ใช้วิธีเลื่อนจุดทศนิยมผ่านสตริง (`1.005` → `"1.005e2"` → `100.5`) แทนการคูณ 100
 * เพราะ `1.005 * 100` ได้ `100.49999999999999` ซึ่งจะถูกปัดลงผิด
 */
export function roundMoney(value: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0

  const text = String(n)
  // ตัวเลขที่แสดงผลเป็น exponent อยู่แล้ว (เช่น 1e+21) ต่อ "e2" ไม่ได้ ใช้วิธีคูณตรง ๆ แทน
  if (text.includes('e') || text.includes('E')) return Math.round(n * 100) / 100

  const shifted = Math.round(Number(`${text}e2`))
  const result = Number(`${shifted}e-2`)
  return Number.isFinite(result) ? result : Math.round(n * 100) / 100
}

/* ---------- ตัวช่วยจัดรูปแบบ ---------- */

const bahtFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 })

export function formatBaht(value: number): string {
  return bahtFormatter.format(Math.round(clean(value)))
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(clean(value)))
}

export function formatPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`
}

export function thaiDate(iso: string): string {
  if (!iso) return '-'
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ---------- เปรียบเทียบการยื่นแบบของคู่สมรส ---------- */

/** ค่าลดหย่อนคู่สมรสที่ไม่มีเงินได้ */
export const SPOUSE_ALLOWANCE = 60_000

export interface SpouseFilingInput {
  /** เงินได้สุทธิของผู้ยื่น (หลังหักค่าใช้จ่ายและค่าลดหย่อนของตัวเองแล้ว) */
  selfNetIncome: number
  /** เงินได้สุทธิของคู่สมรส */
  spouseNetIncome: number
  /** คู่สมรสมีเงินได้ในปีภาษีนี้หรือไม่ */
  spouseHasIncome: boolean
}

export interface SpouseFilingOption {
  key: 'separate' | 'joint'
  label: string
  selfTax: number
  spouseTax: number
  totalTax: number
  /** อธิบายว่าฐานภาษีถูกคิดอย่างไร */
  basis: string
}

export interface SpouseFilingResult {
  separate: SpouseFilingOption
  joint: SpouseFilingOption
  better: 'separate' | 'joint'
  saving: number
  /** คู่สมรสไม่มีเงินได้ กฎหมายให้ยื่นรวมและใช้ค่าลดหย่อนคู่สมรสได้ */
  spouseAllowanceApplied: boolean
}

/**
 * เทียบภาษีระหว่างยื่นแยกกับยื่นรวมของคู่สมรส
 *
 * เพราะอัตราภาษีเป็นขั้นบันได การแยกฐานออกเป็นสองก้อนมักทำให้เสียภาษีน้อยกว่า
 * แต่ถ้าคู่สมรสไม่มีเงินได้ การยื่นรวมจะได้ค่าลดหย่อนคู่สมรสเพิ่มอีก 60,000 บาท
 */
export function compareSpouseFiling(input: SpouseFilingInput): SpouseFilingResult {
  const selfNet = Math.max(0, Number(input.selfNetIncome) || 0)
  const spouseNet = input.spouseHasIncome ? Math.max(0, Number(input.spouseNetIncome) || 0) : 0

  if (!input.spouseHasIncome) {
    // คู่สมรสไม่มีเงินได้ — ยื่นรวมแล้วหักค่าลดหย่อนคู่สมรสได้อีก 60,000 บาท
    const jointBase = Math.max(0, selfNet - SPOUSE_ALLOWANCE)
    const jointTax = calculateProgressiveTax(jointBase)
    const separateTax = calculateProgressiveTax(selfNet)

    return {
      separate: {
        key: 'separate',
        label: 'ยื่นแยก (ไม่ใช้สิทธิลดหย่อนคู่สมรส)',
        selfTax: separateTax,
        spouseTax: 0,
        totalTax: separateTax,
        basis: `คิดจากเงินได้สุทธิ ${formatBaht(selfNet)}`,
      },
      joint: {
        key: 'joint',
        label: 'ยื่นรวมและใช้ค่าลดหย่อนคู่สมรส',
        selfTax: jointTax,
        spouseTax: 0,
        totalTax: jointTax,
        basis: `หักค่าลดหย่อนคู่สมรส ${formatBaht(SPOUSE_ALLOWANCE)} เหลือฐาน ${formatBaht(jointBase)}`,
      },
      better: 'joint',
      saving: separateTax - jointTax,
      spouseAllowanceApplied: true,
    }
  }

  const selfTax = calculateProgressiveTax(selfNet)
  const spouseTax = calculateProgressiveTax(spouseNet)
  const separateTotal = selfTax + spouseTax
  const jointTotal = calculateProgressiveTax(selfNet + spouseNet)

  return {
    separate: {
      key: 'separate',
      label: 'ยื่นแยกกัน',
      selfTax,
      spouseTax,
      totalTax: separateTotal,
      basis: 'แต่ละคนคิดภาษีจากฐานของตัวเอง จึงเริ่มนับขั้นบันไดใหม่ทั้งคู่',
    },
    joint: {
      key: 'joint',
      label: 'ยื่นรวมกัน',
      selfTax: jointTotal,
      spouseTax: 0,
      totalTax: jointTotal,
      basis: `รวมเงินได้สุทธิเป็นก้อนเดียว ${formatBaht(selfNet + spouseNet)}`,
    },
    better: separateTotal <= jointTotal ? 'separate' : 'joint',
    saving: Math.abs(jointTotal - separateTotal),
    spouseAllowanceApplied: false,
  }
}
