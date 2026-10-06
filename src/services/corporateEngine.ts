/**
 * เครื่องคำนวณภาษีเงินได้นิติบุคคล — ฟังก์ชันบริสุทธิ์ทั้งหมด
 *
 * ลำดับการคำนวณ:
 *   รายได้ − รายจ่ายทางบัญชี = กำไรสุทธิทางบัญชี
 *   + รายจ่ายต้องห้าม (บวกกลับ) − รายได้ที่ได้รับยกเว้น − ผลขาดทุนยกมา
 *   = กำไรสุทธิทางภาษี → คำนวณภาษีตามประเภทนิติบุคคล
 */

import {
  FOUNDATION_RATE_OTHER,
  FOUNDATION_RATE_SECTION_8,
  SME_BRACKETS,
  SME_CAPITAL_LIMIT,
  SME_REVENUE_LIMIT,
  STANDARD_CIT_RATE,
  type EntityType,
} from '@/data/corporateTaxData'

export interface CorporateInput {
  entityType: EntityType
  /** ทุนจดทะเบียนที่ชำระแล้ว — ใช้ตรวจสิทธิ์ SME */
  paidUpCapital: number
  revenue: number
  expenses: number
  /** รายจ่ายต้องห้ามที่ต้องบวกกลับ */
  addBacks: number
  /** รายได้ที่ได้รับยกเว้นภาษี เช่น กิจการที่ได้รับส่งเสริม BOI */
  exemptIncome: number
  /** ผลขาดทุนสุทธิยกมาไม่เกิน 5 รอบบัญชี */
  lossCarryforward: number
  /** ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้ */
  withholdingTax: number
  /** ภาษีที่ชำระไว้แล้วตาม ภ.ง.ด.51 */
  halfYearTaxPaid: number
  /** สำหรับมูลนิธิ/สมาคม: สัดส่วนรายได้ที่เป็นเงินได้ตามมาตรา 40(8) */
  section8Share: number
}

export interface CorporateBracketLine {
  label: string
  rate: number
  amount: number
  tax: number
}

export interface CorporateResult {
  /** กำไรสุทธิทางบัญชี */
  accountingProfit: number
  /** กำไรสุทธิทางภาษีก่อนหักผลขาดทุนยกมา */
  profitBeforeLoss: number
  /** ผลขาดทุนยกมาที่นำมาหักได้จริง */
  lossApplied: number
  /** กำไรสุทธิที่ใช้เป็นฐานภาษี */
  taxableProfit: number
  tax: number
  withholdingTax: number
  halfYearTaxPaid: number
  /** > 0 ต้องชำระเพิ่ม, < 0 ขอคืนได้ */
  balance: number
  effectiveRate: number
  marginalRate: number
  /** เข้าเกณฑ์ SME หรือไม่ (ตรวจจากทุนและรายได้) */
  smeEligible: boolean
  /** ระบุเมื่อผู้ใช้เลือก SME แต่คุณสมบัติไม่ผ่าน */
  smeWarning: string
  bracketLines: CorporateBracketLine[]
  /** ผลขาดทุนคงเหลือยกไปรอบถัดไป */
  lossRemaining: number
}

function clean(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** ภาษีของ SME ตามอัตราขั้นบันได พร้อมรายละเอียดแต่ละขั้น */
export function calculateSmeBrackets(profit: number): CorporateBracketLine[] {
  const lines: CorporateBracketLine[] = []
  let previousCap = 0

  for (const bracket of SME_BRACKETS) {
    const amount = Math.max(0, Math.min(profit, bracket.cap) - previousCap)
    lines.push({ label: bracket.label, rate: bracket.rate, amount, tax: amount * bracket.rate })
    previousCap = bracket.cap
    if (profit <= previousCap) break
  }

  return lines
}

/** ตรวจว่านิติบุคคลเข้าเกณฑ์ SME หรือไม่ */
export function isSmeEligible(paidUpCapital: number, revenue: number): boolean {
  return clean(paidUpCapital) <= SME_CAPITAL_LIMIT && clean(revenue) <= SME_REVENUE_LIMIT
}

export function calculateCorporateTax(input: CorporateInput): CorporateResult {
  const revenue = clean(input.revenue)
  const expenses = clean(input.expenses)
  const accountingProfit = revenue - expenses

  const profitBeforeLoss =
    accountingProfit + clean(input.addBacks) - clean(input.exemptIncome)

  // ผลขาดทุนยกมาหักได้เท่าที่มีกำไรเท่านั้น ส่วนที่เหลือยกไปรอบถัดไป
  const lossAvailable = clean(input.lossCarryforward)
  const lossApplied = Math.min(lossAvailable, Math.max(0, profitBeforeLoss))
  const lossRemaining = lossAvailable - lossApplied
  const taxableProfit = Math.max(0, profitBeforeLoss - lossApplied)

  const smeEligible = isSmeEligible(input.paidUpCapital, revenue)
  let smeWarning = ''
  let tax = 0
  let marginalRate = 0
  let bracketLines: CorporateBracketLine[] = []

  if (input.entityType === 'foundation') {
    // มูลนิธิและสมาคมเสียภาษีจากรายได้ก่อนหักรายจ่าย ไม่ใช่จากกำไรสุทธิ
    const share = Math.min(1, Math.max(0, Number(input.section8Share) || 0))
    const section8Revenue = revenue * share
    const otherRevenue = revenue - section8Revenue
    bracketLines = [
      {
        label: 'รายได้ตามมาตรา 40(8)',
        rate: FOUNDATION_RATE_SECTION_8,
        amount: section8Revenue,
        tax: section8Revenue * FOUNDATION_RATE_SECTION_8,
      },
      {
        label: 'รายได้ประเภทอื่น',
        rate: FOUNDATION_RATE_OTHER,
        amount: otherRevenue,
        tax: otherRevenue * FOUNDATION_RATE_OTHER,
      },
    ].filter((line) => line.amount > 0)
    tax = bracketLines.reduce((sum, line) => sum + line.tax, 0)
    marginalRate = otherRevenue > 0 ? FOUNDATION_RATE_OTHER : FOUNDATION_RATE_SECTION_8
  } else if (input.entityType === 'sme') {
    if (!smeEligible) {
      smeWarning =
        'คุณสมบัติไม่เข้าเกณฑ์ SME (ทุนชำระแล้วต้องไม่เกิน 5 ล้านบาท และรายได้ไม่เกิน 30 ล้านบาท) — ระบบคำนวณให้ในอัตราบริษัททั่วไป 20%'
      tax = taxableProfit * STANDARD_CIT_RATE
      marginalRate = taxableProfit > 0 ? STANDARD_CIT_RATE : 0
      bracketLines = [
        { label: 'กำไรสุทธิทั้งจำนวน', rate: STANDARD_CIT_RATE, amount: taxableProfit, tax },
      ]
    } else {
      bracketLines = calculateSmeBrackets(taxableProfit)
      tax = bracketLines.reduce((sum, line) => sum + line.tax, 0)
      const reached = bracketLines.filter((line) => line.amount > 0)
      marginalRate = reached[reached.length - 1]?.rate ?? 0
    }
  } else {
    tax = taxableProfit * STANDARD_CIT_RATE
    marginalRate = taxableProfit > 0 ? STANDARD_CIT_RATE : 0
    bracketLines = [
      { label: 'กำไรสุทธิทั้งจำนวน', rate: STANDARD_CIT_RATE, amount: taxableProfit, tax },
    ]
  }

  const paid = clean(input.withholdingTax) + clean(input.halfYearTaxPaid)
  const base = input.entityType === 'foundation' ? revenue : taxableProfit

  return {
    accountingProfit,
    profitBeforeLoss,
    lossApplied,
    taxableProfit,
    tax,
    withholdingTax: clean(input.withholdingTax),
    halfYearTaxPaid: clean(input.halfYearTaxPaid),
    balance: tax - paid,
    effectiveRate: base > 0 ? tax / base : 0,
    marginalRate,
    smeEligible,
    smeWarning,
    bracketLines,
    lossRemaining,
  }
}
