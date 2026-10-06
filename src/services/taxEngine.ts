/**
 * เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา — ฟังก์ชันบริสุทธิ์ทั้งหมด (ไม่แตะ DOM/แหล่งข้อมูลภายนอก)
 * จึงเขียนเทสต์ตรวจได้ และหน้าไหนก็เรียกใช้ได้เหมือนกัน
 *
 * ลำดับการคำนวณตามประมวลรัษฎากร:
 *   เงินได้พึงประเมิน − เงินได้ที่ได้รับยกเว้น (ผู้สูงอายุ/ผู้พิการ 190,000) − ค่าใช้จ่าย
 *   − ค่าลดหย่อน (ยกเว้นบริจาค)
 *   − บริจาคเพื่อการศึกษา (2 เท่า, ≤ 10%) − บริจาคทั่วไป (≤ 10% ของยอดที่เหลือ)
 *   = เงินได้สุทธิ → คำนวณภาษีตามอัตราขั้นบันได
 */

import {
  DEDUCTION_ITEMS,
  DEFAULT_TAX_YEAR,
  DONATION_KEYS,
  DONATION_RATE_CAP,
  INCOME_CATEGORIES,
  ACTUAL_EXPENSE_CODES,
  SAVINGS_INTEREST_EXEMPTION,
  SENIOR_EXEMPTION,
  SEVERANCE_EXEMPTION,
  deductionCapFor,
  isDeductionAvailable,
  LIFE_HEALTH_POOL_CAP,
  LIFE_HEALTH_POOL_KEYS,
  RETIREMENT_POOL_CAP,
  RETIREMENT_POOL_KEYS,
  TAX_BRACKETS,
} from '@/data/taxData'

export type AmountMap = Record<string, number>

export interface TaxOptions {
  /** ปีภาษี พ.ศ. — กำหนดว่ารายการลดหย่อนไหนใช้ได้และเพดานเท่าไร */
  taxYear?: string
  /** อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ/ทุพพลภาพ: ยกเว้นเงินได้ 190,000 บาท ก่อนหักค่าใช้จ่าย */
  seniorExemption?: boolean
  /**
   * ค่าใช้จ่ายตามจริงของเงินได้ 40(5)–(8) ที่เลือกหักตามจริงแทนแบบเหมา (คีย์ = ประเภทเงินได้)
   * ประเภทที่ไม่ได้ระบุใช้แบบเหมาตามเดิม
   */
  actualExpenses?: AmountMap
  /** ภาษีที่ชำระไปแล้วตาม ภ.ง.ด.94 (ภาษีครึ่งปี) นำมาหักตอนยื่นสิ้นปี */
  halfYearTaxPaid?: number
  /** ค่าลดหย่อนส่วนตัว (ปกติ 60,000 · ภาษีครึ่งปีใช้ 30,000) */
  personalAllowance?: number
  /** คิดภาษีขั้นต่ำ 0.5% ตามมาตรา 48(2) หรือไม่ (ค่าเริ่มต้น: คิด) */
  minimumTax?: boolean
}

/** ประเภทเงินได้นี้เลือกหักค่าใช้จ่ายตามจริงได้หรือไม่ */
export function canUseActualExpense(key: string): boolean {
  const code = INCOME_CATEGORIES.find((c) => c.key === key)?.code ?? ''
  return ACTUAL_EXPENSE_CODES.includes(code)
}

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
  /** เงินได้ที่ได้รับยกเว้น (ผู้สูงอายุ/ผู้พิการ) หักออกก่อนค่าใช้จ่าย */
  exemptIncome: number
  /** ประเภทเงินได้ที่ใช้สิทธิยกเว้น 190,000 */
  exemptCategory: string | null
  /** รายละเอียดเงินได้ที่ได้รับยกเว้นแต่ละก้อน */
  exemptLines: { label: string; amount: number }[]
  /** ภาษีที่ชำระแล้วตาม ภ.ง.ด.94 */
  halfYearTaxPaid: number
  taxYear: string
  totalExpense: number
  incomeAfterExpense: number
  /** สิทธิลดหย่อนรวมหลังตัดเพดาน — อาจมากกว่าเงินได้ที่เหลือให้หัก */
  totalDeduction: number
  /** ค่าลดหย่อนที่หักได้จริง = เงินได้หลังหักค่าใช้จ่าย − เงินได้สุทธิ */
  usedDeduction: number
  /** ค่าลดหย่อนทั่วไปส่วนที่หักได้จริง ไม่เกินเงินได้หลังหักค่าใช้จ่าย */
  usedGeneralDeduction: number
  /** ค่าลดหย่อนที่ไม่ใช่เงินบริจาค */
  generalDeduction: number
  donationDeduction: number
  netIncome: number
  /** ภาษีที่ต้องเสียจริง = ยอดที่สูงกว่าระหว่างภาษีขั้นบันไดกับภาษีขั้นต่ำตามมาตรา 48(2) */
  tax: number
  /** ภาษีตามอัตราขั้นบันไดจากเงินได้สุทธิ */
  progressiveTax: number
  minimumTax: MinimumTax
  /** ยอด tax มาจากวิธีไหน */
  taxMethod: TaxMethod
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

export type TaxMethod = 'progressive' | 'minimum'

export interface MinimumTax {
  /** เงินได้พึงประเมินตามมาตรา 40(2)–40(8) รวมกัน */
  base: number
  /** ภาษี 0.5% ของฐานข้างต้น */
  tax: number
  /** ถึงเกณฑ์ต้องเทียบหรือไม่ (ฐานตั้งแต่ 1 ล้านบาท และภาษีเกิน 5,000 บาท) */
  applies: boolean
}

/** มาตรา 48(2): เกณฑ์ เงินได้ 40(2)–(8) ตั้งแต่ 1 ล้านบาท */
export const MINIMUM_TAX_THRESHOLD = 1_000_000
export const MINIMUM_TAX_RATE = 0.005
/** ภาษีตามวิธีนี้ไม่เกิน 5,000 บาทได้รับยกเว้น */
export const MINIMUM_TAX_EXEMPT = 5_000

const INF = Number.POSITIVE_INFINITY

/**
 * ภาษีขั้นต่ำตามมาตรา 48(2)
 * ผู้มีเงินได้ 40(2)–40(8) รวมกันตั้งแต่ 1 ล้านบาท ต้องคำนวณ 0.5% ของเงินได้เหล่านั้น
 * เทียบกับภาษีขั้นบันได แล้วเสียตามยอดที่สูงกว่า ถ้า 0.5% ได้ไม่เกิน 5,000 บาทได้รับยกเว้น
 */
export function calculateMinimumTax(expenseLines: ExpenseLine[]): MinimumTax {
  const base = roundMoney(
    expenseLines.filter((line) => line.code !== '40(1)').reduce((sum, line) => sum + line.income, 0),
  )
  const tax = roundMoney(base * MINIMUM_TAX_RATE)
  return { base, tax, applies: base >= MINIMUM_TAX_THRESHOLD && tax > MINIMUM_TAX_EXEMPT }
}

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
      amount: roundMoney(amount),
      // ปัดภาษีของแต่ละขั้นเป็นสตางค์ ภาษีรวมจึงเท่ากับผลบวกของทุกขั้นที่แสดงบนจอพอดี
      tax: roundMoney(amount * bracket.rate),
    })
    previousCap = bracket.cap
    if (netIncome <= previousCap) break
  }

  return lines
}

/** ภาษีที่ต้องเสียจากเงินได้สุทธิ */
export function calculateProgressiveTax(netIncome: number): number {
  return roundMoney(calculateBrackets(clean(netIncome)).reduce((sum, line) => sum + line.tax, 0))
}

/** ค่าใช้จ่ายแบบเหมาของเงินได้แต่ละประเภท (40(1) กับ 40(2) ใช้เพดานร่วมกัน) */
export function calculateExpenses(income: AmountMap, actualExpenses: AmountMap = {}): ExpenseLine[] {
  // รวมเงินได้ของแต่ละกลุ่มที่ใช้เพดานร่วมกันก่อน แล้วค่อยเฉลี่ยค่าใช้จ่ายกลับเข้าแต่ละประเภท
  const poolIncome: Record<string, number> = {}
  for (const category of INCOME_CATEGORIES) {
    if (!category.expensePool) continue
    poolIncome[category.expensePool] =
      (poolIncome[category.expensePool] ?? 0) + clean(income[category.key])
  }

  // ยอดที่แบ่งไปแล้วและเงินได้ที่ยังไม่ได้แบ่งของแต่ละกลุ่ม
  // ใช้ให้รายการสุดท้ายของกลุ่มรับเศษสตางค์ที่เหลือ ยอดรวมจึงเท่าเพดานพอดีไม่ขาดไม่เกิน
  const poolAllocated: Record<string, number> = {}
  const poolRemaining: Record<string, number> = { ...poolIncome }

  return INCOME_CATEGORIES.map((category) => {
    const amount = clean(income[category.key])
    const cap = category.expenseCap ?? INF
    let expense: number
    let cappedByLimit = false

    if (category.expensePool) {
      const pool = category.expensePool
      const total = poolIncome[pool] ?? 0
      const poolExpense = roundMoney(Math.min(total * category.expenseRate, cap))
      cappedByLimit = total * category.expenseRate > cap
      poolRemaining[pool] = (poolRemaining[pool] ?? 0) - amount
      const isLastWithIncome = amount > 0 && poolRemaining[pool]! <= 0
      // แบ่งค่าใช้จ่ายของกลุ่มตามสัดส่วนเงินได้ เพื่อให้ยอดรวมยังตรงกับเพดาน
      expense =
        total <= 0 || amount <= 0
          ? 0
          : isLastWithIncome
            ? roundMoney(poolExpense - (poolAllocated[pool] ?? 0))
            : roundMoney((poolExpense * amount) / total)
      poolAllocated[pool] = (poolAllocated[pool] ?? 0) + expense
    } else if (actualExpenses[category.key] !== undefined && ACTUAL_EXPENSE_CODES.includes(category.code)) {
      // หักตามจริง: ไม่มีเพดาน แต่หักเกินเงินได้ของประเภทนั้นไม่ได้
      expense = roundMoney(Math.min(clean(actualExpenses[category.key]), amount))
    } else {
      const raw = amount * category.expenseRate
      expense = roundMoney(Math.min(raw, cap))
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
function applyDeductionLimits(
  deductions: AmountMap,
  grossIncome: number,
  salaryIncome: number,
  taxYear: string,
  personalAllowance?: number,
): DeductionLine[] {
  const lines: DeductionLine[] = DEDUCTION_ITEMS.filter((item) => !DONATION_KEYS.includes(item.key)).map(
    (item) => {
      const fixedAmount = item.key === 'personal' && personalAllowance !== undefined ? personalAllowance : (item.preset ?? item.cap ?? 0)
      const entered = item.fixed ? fixedAmount : clean(deductions[item.key])

      // รายการที่ไม่มีในปีภาษีนี้ (เช่น SSF หลังปี 2567) หักไม่ได้เลย
      if (!isDeductionAvailable(item, taxYear)) {
        return {
          key: item.key,
          label: item.label,
          entered,
          allowed: 0,
          limit: 0,
          cappedReason: entered > 0 ? `ไม่มีสิทธินี้ในปีภาษี ${taxYear}` : '',
        }
      }

      const itemCap = item.fixed ? entered : (deductionCapFor(item, taxYear) ?? INF)
      // กองทุนสำรองเลี้ยงชีพคิดจากค่าจ้าง ส่วนรายการอื่นคิดจากเงินได้พึงประเมินทั้งหมด
      const rateBase = item.capRateBase === 'salary' ? salaryIncome : grossIncome
      const rateCap = item.capRateOfIncome
        ? roundMoney((item.capBase ?? 0) + rateBase * item.capRateOfIncome)
        : INF
      const limit = Math.min(itemCap, rateCap)
      // ค่าสร้างบ้านใหม่: กรอกค่าก่อสร้าง ได้ลดหย่อนตามจำนวนล้านเต็ม
      const claimable = item.perMillion ? Math.floor(entered / 1_000_000) * item.perMillion : entered
      const allowed = Math.min(claimable, limit)

      let cappedReason = ''
      if (claimable > limit) {
        cappedReason =
          rateCap < itemCap
            ? item.capRateBase === 'salary'
              ? `เกินเพดาน ${(item.capBase ?? 0).toLocaleString('th-TH')} + ${(item.capRateOfIncome ?? 0) * 100}% ของค่าจ้าง`
              : `เกินเพดาน ${(item.capRateOfIncome ?? 0) * 100}% ของเงินได้`
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

  // เบี้ยประกันบำนาญส่วนที่เกินสิทธิของตัวเอง นำไปใช้ในวงเงินประกันชีวิตที่ยังเหลือได้
  // (ไม่นับรวมในเพดานกองทุนเกษียณ 500,000 เพราะหักในฐานะเบี้ยประกันชีวิต)
  const pension = byKey.get('pensionInsurance')
  if (pension && pension.entered > pension.allowed) {
    const lifeUsed = LIFE_HEALTH_POOL_KEYS.reduce((s, k) => s + (byKey.get(k)?.allowed ?? 0), 0)
    const room = Math.max(0, LIFE_HEALTH_POOL_CAP - lifeUsed)
    const extra = roundMoney(Math.min(pension.entered - pension.allowed, room))
    if (extra > 0) {
      lines.push({
        key: 'pensionAsLife',
        label: 'เบี้ยประกันบำนาญส่วนที่ใช้วงเงินประกันชีวิต',
        entered: extra,
        allowed: extra,
        limit: room,
        cappedReason: '',
      })
    }
  }

  return lines
}

/**
 * ใช้สิทธิยกเว้น 190,000 บาทกับประเภทเงินได้ที่ทำให้เงินได้หลังหักค่าใช้จ่ายลดลงมากที่สุด
 * (กฎหมายให้เลือกใช้กับเงินได้ประเภทใดก็ได้) เช่นยกเว้นเงินเดือนที่หักค่าใช้จ่ายเต็มเพดานแล้ว
 * จะได้ผลเต็ม 190,000 แต่ถ้ายกเว้นเงินได้ 40(8) ที่หักเหมา 60% จะลดฐานได้แค่ 40%
 */
function applySeniorExemption(
  income: AmountMap,
  actualExpenses: AmountMap = {},
): { income: AmountMap; amount: number; key: string | null } {
  const netOf = (map: AmountMap) =>
    calculateExpenses(map, actualExpenses).reduce((s, l) => s + l.income - l.expense, 0)
  const base = netOf(income)
  let best: { income: AmountMap; amount: number; key: string | null; net: number } = {
    income,
    amount: 0,
    key: null,
    net: base,
  }
  for (const c of INCOME_CATEGORIES) {
    const amount = Math.min(SENIOR_EXEMPTION, clean(income[c.key]))
    if (amount <= 0) continue
    const next = { ...income, [c.key]: clean(income[c.key]) - amount }
    const net = netOf(next)
    if (net < best.net - 0.005) best = { income: next, amount, key: c.key, net }
  }
  return best
}

/** ค่าชดเชยเลิกจ้างและดอกเบี้ยออมทรัพย์ส่วนที่กฎหมายยกเว้น ตัดออกก่อนคำนวณอย่างอื่น */
function applySpecificExemptions(income: AmountMap): { income: AmountMap; lines: { label: string; amount: number }[] } {
  const next = { ...income }
  const lines: { label: string; amount: number }[] = []

  const severance = clean(income.severance)
  if (severance > 0) {
    const exempt = Math.min(severance, SEVERANCE_EXEMPTION)
    next.severance = severance - exempt
    lines.push({ label: 'ค่าชดเชยเลิกจ้าง', amount: roundMoney(exempt) })
  }

  // ดอกเบี้ยออมทรัพย์: ไม่เกิน 20,000 ยกเว้นทั้งจำนวน แต่ถ้าเกินต้องเสียทั้งจำนวน
  const savings = clean(income.savingsInterest)
  if (savings > 0 && savings <= SAVINGS_INTEREST_EXEMPTION) {
    next.savingsInterest = 0
    lines.push({ label: 'ดอกเบี้ยออมทรัพย์ไม่เกิน 20,000', amount: roundMoney(savings) })
  }
  return { income: next, lines }
}

/** คำนวณภาษีทั้งชุดจากเงินได้ ค่าลดหย่อน และภาษีที่ถูกหักไว้ */
export function calculateTax(
  income: AmountMap,
  deductions: AmountMap,
  withholdingTax = 0,
  options: TaxOptions = {},
): TaxResult {
  const taxYear = options.taxYear ?? DEFAULT_TAX_YEAR
  const grossIncome = roundMoney(INCOME_CATEGORIES.reduce((sum, c) => sum + clean(income[c.key]), 0))
  const salaryIncome = clean(income.salary)

  // เงินได้ที่กฎหมายยกเว้นเฉพาะ: ค่าชดเชยเลิกจ้างไม่เกิน 600,000 และดอกเบี้ยออมทรัพย์ทั้งปีไม่เกิน 20,000
  const specific = applySpecificExemptions(income)
  const actual = options.actualExpenses ?? {}
  // ผู้สูงอายุ/ผู้พิการ: ยกเว้นเงินได้ 190,000 บาท หักออกก่อนค่าใช้จ่าย
  const exemption = options.seniorExemption
    ? applySeniorExemption(specific.income, actual)
    : { income: specific.income, amount: 0, key: null }
  const expenseLines = calculateExpenses(exemption.income, actual)
  const exemptLines = [
    ...specific.lines,
    ...(exemption.amount > 0 ? [{ label: 'ผู้มีอายุ 65 ปีขึ้นไป / ผู้พิการ', amount: roundMoney(exemption.amount) }] : []),
  ]
  // ทุกยอดปัดเป็นสตางค์ก่อนส่งต่อขั้นถัดไป ตัวเลขที่แสดงบนจอจึงบวกลบกันได้ตรงทุกบรรทัด
  const exemptIncome = roundMoney(exemptLines.reduce((s, l) => s + l.amount, 0))
  const totalExpense = roundMoney(expenseLines.reduce((sum, line) => sum + line.expense, 0))
  const incomeAfterExpense = roundMoney(Math.max(0, grossIncome - exemptIncome - totalExpense))

  const generalLines = applyDeductionLimits(deductions, grossIncome, salaryIncome, taxYear, options.personalAllowance)
  const generalDeduction = roundMoney(generalLines.reduce((sum, line) => sum + line.allowed, 0))
  const baseBeforeDonation = roundMoney(Math.max(0, incomeAfterExpense - generalDeduction))

  // บริจาคเพื่อการศึกษาหักได้ 2 เท่า แต่ไม่เกิน 10% ของฐานก่อนบริจาค
  const educationPaid = clean(deductions.donationEducation)
  const educationLimit = roundMoney(baseBeforeDonation * DONATION_RATE_CAP)
  const educationAllowed = roundMoney(Math.min(educationPaid * 2, educationLimit))

  // บริจาคทั่วไปคิดเพดาน 10% จากยอดที่เหลือหลังหักบริจาคเพื่อการศึกษาแล้ว
  const generalDonationPaid = clean(deductions.donationGeneral)
  const remainingBase = Math.max(0, baseBeforeDonation - educationAllowed)
  const generalDonationLimit = roundMoney(remainingBase * DONATION_RATE_CAP)
  const generalDonationAllowed = roundMoney(Math.min(generalDonationPaid, generalDonationLimit))

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

  const donationDeduction = roundMoney(educationAllowed + generalDonationAllowed)
  const netIncome = roundMoney(Math.max(0, baseBeforeDonation - donationDeduction))
  const bracketLines = calculateBrackets(netIncome)
  const progressiveTax = roundMoney(bracketLines.reduce((sum, line) => sum + line.tax, 0))
  const minimum =
    options.minimumTax === false ? { base: 0, tax: 0, applies: false } : calculateMinimumTax(expenseLines)
  // มาตรา 48(2): เสียตามวิธีที่ได้ยอดสูงกว่า
  const taxMethod: TaxMethod = minimum.applies && minimum.tax > progressiveTax ? 'minimum' : 'progressive'
  const tax = taxMethod === 'minimum' ? minimum.tax : progressiveTax
  const halfYearTaxPaid = roundMoney(clean(options.halfYearTaxPaid))
  // ภาษีที่จ่ายแล้วทั้งหมด = หัก ณ ที่จ่าย + ภาษีครึ่งปี
  const paid = roundMoney(clean(withholdingTax) + halfYearTaxPaid)

  const reachedBrackets = bracketLines.filter((line) => line.amount > 0)
  const marginalRate = reachedBrackets[reachedBrackets.length - 1]?.rate ?? 0

  return {
    grossIncome,
    totalExpense,
    incomeAfterExpense,
    totalDeduction: roundMoney(generalDeduction + donationDeduction),
    // สิทธิลดหย่อนอาจมากกว่าเงินได้ที่เหลือให้หัก ส่วนที่หักได้จริงคือส่วนที่ทำให้เงินได้สุทธิลดลง
    usedDeduction: roundMoney(incomeAfterExpense - netIncome),
    exemptIncome,
    exemptCategory: exemption.key,
    exemptLines,
    taxYear,
    usedGeneralDeduction: roundMoney(Math.min(generalDeduction, incomeAfterExpense)),
    generalDeduction,
    donationDeduction,
    netIncome,
    tax,
    progressiveTax,
    minimumTax: minimum,
    taxMethod,
    withholdingTax: roundMoney(clean(withholdingTax)),
    halfYearTaxPaid,
    balance: roundMoney(tax - paid),
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
  return roundMoney(before - after)
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

const bahtSatangFormatter = new Intl.NumberFormat('th-TH', {
  style: 'currency',
  currency: 'THB',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })

/**
 * จัดรูปแบบเงินบาท
 *
 * เดิมตัดค่าติดลบเป็น 0 และปัดเศษสตางค์ทิ้ง ยอดคงเหลือที่ติดลบจึงแสดงเป็น ฿0
 * และยอดย่อยที่ปัดทีละบรรทัดบวกกันไม่เท่ายอดรวม
 * ตอนนี้แสดงเครื่องหมายลบ และแสดงสตางค์เฉพาะยอดที่มีเศษจริง
 */
export function formatBaht(value: number): string {
  const n = roundMoney(Number(value) || 0)
  if (n === 0) return bahtFormatter.format(0)
  return Number.isInteger(n) ? bahtFormatter.format(n) : bahtSatangFormatter.format(n)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(roundMoney(Number(value) || 0))
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
